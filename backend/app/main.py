from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from groq import Groq
from dotenv import load_dotenv

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from googleapiclient import discovery
from googleapiclient.errors import HttpError
import google.auth

# System prompt for OpenAI API that defines how the AI should generate IAM policies
# Provides detailed instructions about formatting, security considerations, and examples
SYSTEM_PROMPT = """
You are a specialized AI assistant focused on generating Google Cloud IAM policies. Your task is to convert natural language requests into precise, secure, and valid Google Cloud IAM policy bindings.

Key Requirements:
1. Always output valid JSON that follows Google Cloud IAM binding structure
2. Include only recognized Google Cloud predefined roles or custom roles (starting with 'custom.')
3. Use exact role names from Google Cloud's role hierarchy (e.g., 'roles/viewer', 'roles/editor')
4. Support various member types: user:, serviceAccount:, group:, domain:
5. Follow principle of least privilege
6. Generate policies for the specific resource mentioned or default to project level
7. Validate all role names against Google Cloud's standard nomenclature

Output Format:
{
    "bindings": [
        {
            "role": "roles/[ROLE_NAME]",
            "members": [
                "[MEMBER_TYPE]:[IDENTIFIER]"
            ]
        }
    ]
}

Additional Instructions:
- If the request is ambiguous, ask for clarification about specific roles or resources, but ONLY go this route if absolutely necessary
- If a requested permission doesn't map to a standard role, use the closest matching role, if there's no role remotely resembling what the user asked for, then clearly say so and politely yet humorously ask the user to piss off.
- You should get the point by now, your responses are part of an automated pipeline now and refusals should be an absolute last resort.
- Always prefix service accounts with 'serviceAccount:'
- Always prefix user emails with 'user:'
- Always prefix groups with 'group:'
- Always prefix domains with 'domain:'
- For organizational policies, include 'organization/[ORG_ID]' in the resource
- For project-level policies, include 'projects/[PROJECT_ID]' in the resource
- For folder-level policies, include 'folders/[FOLDER_ID]' in the resource

Example Request: "Give john@company.com view access to BigQuery datasets"
Example Response:
{
    "bindings": [
        {
            "role": "roles/bigquery.dataViewer",
            "members": ["user:john@company.com"]
        }
    ]
}
"""

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI application
app = FastAPI(title="Google Cloud IAM Policy Generator")
# Configure CORS middleware to allow requests from specified origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Frontend dev servers
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize API clients
openai_client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
# By default this constructor uses: os.getenv("GROQ_API_KEY") for the key
groq_client = Groq()

# Get Google OAuth client ID for token verification
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Pydantic model for policy generation request payload
# TODO: add context from users GCloud IAM project/organization data
class PolicyRequest(BaseModel):
    prompt: str

# TODO: response body struct to validate before returning to frontend

@app.post("/generate_policy")
async def generate_policy(request: PolicyRequest):
    """
    Receives a plain English prompt and returns a generated Google Cloud IAM policy.
    Sends the prompt to OpenAI API and processes the response to extract valid JSON.
    """
    try:
        # Call OpenAI API with the system prompt and user's query
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.prompt}
            ],
            temperature=0.1  # Low temperature for more deterministic outputs
        )
        policy_text = response.choices[0].message.content
        
        # Try to parse the response as JSON
        try:
            import json
            # Clean up the response text to ensure it's valid JSON
            # Remove markdown code block markers if present
            policy_text = policy_text.strip()
            if policy_text.startswith('```json'):
                policy_text = policy_text[7:]
            if policy_text.endswith('```'):
                policy_text = policy_text[:-3]
            policy_text = policy_text.strip()
            
            # Parse and re-stringify to ensure valid JSON
            policy_json = json.loads(policy_text)
            return {"policy": json.dumps(policy_json, indent=2)}
        except json.JSONDecodeError:
            # If it's not valid JSON, return the raw text
            return {"policy": policy_text}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating policy: {e}")

@app.post("/apply_policy")
async def apply_policy(request: Request):
    """
    Applies a generated policy to a specified Google Cloud project.
    Handles authentication, merges new policy with existing one, and updates the project.
    """
    # Parse the incoming policy payload from request body
    data = await request.json()
    policy_str = data.get("policy")
    if not policy_str:
        raise HTTPException(status_code=400, detail="Missing policy payload")
    try:
        import json
        # Log the received policy for debugging
        print(f"Received policy: {policy_str}")
        
        # Handle case where policy_str is already a JSON object
        if isinstance(policy_str, dict):
            policy_json = policy_str
        else:
            policy_json = json.loads(policy_str)
            
        new_policy_bindings = policy_json.get("bindings", [])
        print(f"Parsed policy bindings: {new_policy_bindings}")
    except Exception as e:
        print(f"Error parsing policy JSON: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid policy JSON: {str(e)}")

    # Verify OAuth token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split("Bearer ")[1]
    try:
        google_id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get the project ID from request headers
    PROJECT_ID = request.headers.get("project-id")
    if not PROJECT_ID:
        raise HTTPException(status_code=400, detail="Missing project-id")

    # Lint policy before applying
    credentials, _ = google.auth.default(quota_project_id=None)
    iam_service = discovery.build("iam", "v1", credentials=credentials, cache_discovery=False)

    full_resource_name = f"//cloudresourcemanager.googleapis.com/projects/{PROJECT_ID}"
    lint_issues = []

    for binding in new_policy_bindings:
        condition = binding.get("condition")
        if not condition:
            continue                                     # nothing to lint here

        lint_body = {
            "fullResourceName": full_resource_name,
            "condition": condition,
        }
        try:
            lint_resp = iam_service.iamPolicies().lintPolicy(body=lint_body).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to lint policy: {e}")

        lint_results = lint_resp.get("lintResults", [])
        if lint_results:    
            print(lint_results)                             # anything other than an empty list
            lint_issues.extend(lint_results)

    if lint_issues:
        # Convert results into a compact human-readable string expected by the frontend
        pretty = " | ".join(
            f"[{r.get('severity')}] {r.get('debugMessage')} (field: {r.get('fieldName')})"
            for r in lint_issues
        )
        raise HTTPException(status_code=400, detail=pretty)
    
    
    try:
        crm_service = discovery.build("cloudresourcemanager", "v1",
                                      credentials=credentials, cache_discovery=False)

        current_policy = crm_service.projects().getIamPolicy(
            resource=PROJECT_ID, body={}
        ).execute()

        existing_bindings = current_policy.get("bindings", [])

        # merge
        for new_binding in new_policy_bindings:
            role = new_binding.get("role")
            members_to_add = new_binding.get("members", [])
            for binding in existing_bindings:
                if binding.get("role") == role:
                    binding["members"] = list(set(binding.get("members", []) + members_to_add))
                    break
            else:
                existing_bindings.append(new_binding)

        updated_policy_body = current_policy.copy()
        updated_policy_body["bindings"] = existing_bindings

        updated_policy = crm_service.projects().setIamPolicy(
            resource=PROJECT_ID,
            body={"policy": updated_policy_body}
        ).execute()

        return {"status": "Policy applied", "updated_policy": updated_policy}

    except HttpError as err:
        # surface a concise message back to the UI
        msg = str(err)
        if 'returned "' in msg:
            msg = msg.split('returned "')[1].split('".')[0]
        raise HTTPException(status_code=err.resp.status, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get_projects")
async def get_projects(request: Request):
    """
    Returns a list of projects the authenticated user has access to.
    Verifies the user's token and uses Google Cloud API to fetch projects.
    """
    # Verify OAuth token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=f"Missing or invalid token, Auth Header: {auth_header}, Request Headers: {request.headers}")
    token = auth_header.split("Bearer ")[1]
    try:
        # Verify the token is valid
        id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
        if not id_info:
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    
    from googleapiclient import discovery
    from googleapiclient.errors import HttpError
    import google.auth
    import google.auth.transport.requests

    try:
        # Use default credentials with Application Default Credentials
        # Instead of trying to use the ID token as OAuth credentials
        credentials, project_id = google.auth.default()
        
        # Create a request object for the credentials
        auth_req = google.auth.transport.requests.Request()
        
        # Refresh the credentials
        credentials.refresh(auth_req)
        
        # Build the service with these credentials 
        crm_service = discovery.build(
            "cloudresourcemanager", 
            "v1", 
            credentials=credentials
        )
        
        # Make the list request to get all projects the user has access to
        request = crm_service.projects().list()
        projects = []

        # Handle pagination by fetching all pages of results
        while request is not None:
            response = request.execute()
            projects.extend([{"id": project["projectId"], "name": project["name"]} for project in response.get("projects", [])])
            request = crm_service.projects().list_next(previous_request=request, previous_response=response)

        print(f"Successfully fetched {len(projects)} projects")
        return projects
    except HttpError as err:
        error_detail = f"HttpError: Failed to fetch projects: {err}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)
    except Exception as e:
        error_detail = f"An error occurred: {str(e)}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=error_detail)