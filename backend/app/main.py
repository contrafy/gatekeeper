from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

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

# load env vars
load_dotenv()

app = FastAPI(title="Google Cloud IAM Policy Generator")
# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# request body struct
# TODO: add context from users GCloud IAM project/organization data
class PolicyRequest(BaseModel):
    prompt: str

# TODO: response body struct to validate before returning to frontend

@app.post("/generate_policy")
async def generate_policy(request: PolicyRequest):
    """
    Receives a plain English prompt and returns a generated Google Cloud IAM policy.
    """
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.prompt}
            ],
            temperature=0.1
        )
        policy_text = response.choices[0].message.content
        
        # Try to parse the response as JSON
        try:
            import json
            # Clean up the response text to ensure it's valid JSON
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
    # parse the incoming policy payload
    data = await request.json()
    policy_str = data.get("policy")
    if not policy_str:
        raise HTTPException(status_code=400, detail="Missing policy payload")
    try:
        import json
        new_policy_bindings = json.loads(policy_str).get("bindings", [])
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid policy JSON")

    # verify oauth token
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split("Bearer ")[1]
    try:
        id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

    # apply the policy using the cloud resource manager client
    from googleapiclient import discovery
    from googleapiclient.errors import HttpError

    PROJECT_ID = os.getenv("GCLOUD_PROJECT_ID")
    if not PROJECT_ID:
        raise HTTPException(status_code=500, detail="GCLOUD_PROJECT_ID not set in environment")

    try:
        crm_service = discovery.build("cloudresourcemanager", "v1")
        # fetch current iam policy
        current_policy = crm_service.projects().getIamPolicy(
            resource=PROJECT_ID, body={}
        ).execute()

        # get existing bindings
        existing_bindings = current_policy.get("bindings", [])
        # merge new bindings into existing ones
        for new_binding in new_policy_bindings:
            role = new_binding.get("role")
            members_to_add = new_binding.get("members", [])
            # check if binding for this role already exists
            binding_found = False
            for binding in existing_bindings:
                if binding.get("role") == role:
                    # add any new members that aren't already in the binding
                    for member in members_to_add:
                        if member not in binding.get("members", []):
                            binding["members"].append(member)
                    binding_found = True
                    break
            # if no binding exists for the role, add the new binding as is
            if not binding_found:
                existing_bindings.append(new_binding)

        # update policy without removing existing (e.g., owner) bindings
        updated_policy_body = current_policy.copy()
        updated_policy_body["bindings"] = existing_bindings

        updated_policy = crm_service.projects().setIamPolicy(
            resource=PROJECT_ID, body={"policy": updated_policy_body}
        ).execute()

        print("Policy successfully applied:", updated_policy)
        return {"status": "Policy applied", "updated_policy": updated_policy}
    except HttpError as err:
        error_message = f"Failed to apply policy: {err}"
        print(error_message)
        raise HTTPException(status_code=500, detail=error_message)
