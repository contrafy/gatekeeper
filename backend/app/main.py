from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# System prompt for OpenAI API that defines how the AI should generate IAM policies
# Provides detailed instructions about formatting, security considerations, and examples
SYSTEM_PROMPT = """You are a specialized AI assistant focused on generating Google Cloud IAM policies. Your task is to convert natural language requests into precise, secure, and valid Google Cloud IAM policy bindings.

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
- If the request is ambiguous, ask for clarification about specific roles or resources
- If a requested permission doesn't map to a standard role, suggest the closest matching role
- Always prefix service accounts with 'serviceAccount:'
- Always prefix user emails with 'user:'
- Always prefix groups with 'group:'
- Always prefix domains with 'domain:'
- For organizational policies, include 'organization/[ORG_ID]' in the resource
- For project-level policies, include 'projects/[PROJECT_ID]' in the resource
- For folder-level policies, include 'folders/[FOLDER_ID]' in the resource

Security Considerations:
- Never grant overly permissive roles like 'roles/owner' unless explicitly requested
- Suggest breaking down broad role requests into more specific role combinations
- Flag potentially risky combinations of roles and resources
- Validate that service account emails end with '.iam.gserviceaccount.com'

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

# Initialize OpenAI client with API key from environment variables
client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
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
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
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
        id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Apply the policy using the Google Cloud Resource Manager API
    from googleapiclient import discovery
    from googleapiclient.errors import HttpError

    # Get the project ID from request headers
    PROJECT_ID = request.headers.get("project-id")
    if not PROJECT_ID:
        raise HTTPException(status_code=400, detail="Missing project-id")
    
    try:
        # Import google.auth here where it's used
        import google.auth
        # Create service with explicit no quota project
        credentials, _ = google.auth.default(quota_project_id=None)
        crm_service = discovery.build("cloudresourcemanager", "v1", credentials=credentials)
        
        # Fetch current IAM policy for the project
        current_policy = crm_service.projects().getIamPolicy(
            resource=PROJECT_ID, body={}
        ).execute()

        # Get existing bindings from current policy
        existing_bindings = current_policy.get("bindings", [])
        # Merge new bindings into existing ones
        for new_binding in new_policy_bindings:
            role = new_binding.get("role")
            members_to_add = new_binding.get("members", [])
            # Check if binding for this role already exists
            binding_found = False
            for binding in existing_bindings:
                if binding.get("role") == role:
                    # Add any new members that aren't already in the binding
                    for member in members_to_add:
                        if member not in binding.get("members", []):
                            binding["members"].append(member)
                    binding_found = True
                    break
            # If no binding exists for the role, add the new binding as is
            if not binding_found:
                existing_bindings.append(new_binding)

        # Update policy without removing existing (e.g., owner) bindings
        updated_policy_body = current_policy.copy()
        updated_policy_body["bindings"] = existing_bindings

        # Apply the updated policy to the project
        updated_policy = crm_service.projects().setIamPolicy(
            resource=PROJECT_ID, body={"policy": updated_policy_body}
        ).execute()

        print("Policy successfully applied:", updated_policy)
        return {"status": "Policy applied", "updated_policy": updated_policy}
    except HttpError as err:
        # Extract the meaningful error message for better user experience
        error_message = str(err)
        clean_message = "Failed to apply policy"
        
        # Parse out specific error info from Google's error messages
        if "Details:" in error_message:
            detail_section = error_message.split("Details:")[1].strip()
            if detail_section.startswith('"') and detail_section.endswith('"'):
                detail_section = detail_section[1:-1]  # Remove extra quotes
            clean_message = f"Error: {detail_section}"
        elif "returned" in error_message:
            # Extract the part between 'returned' and 'Details' if present
            returned_part = error_message.split('returned "')[1].split('".')[0]
            clean_message = f"Error: {returned_part}"
        
        print(f"Original error: {error_message}")
        print(f"Cleaned error for user: {clean_message}")
        raise HTTPException(status_code=err.resp.status, detail=clean_message)

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