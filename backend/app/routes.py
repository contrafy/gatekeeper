from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import json

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from googleapiclient import discovery
from googleapiclient.errors import HttpError
import google.auth

import helpers

import os

# Get Google OAuth client ID for token verification
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

router = APIRouter()

# Pydantic model for policy generation request payload
# TODO: add context from users GCloud IAM project/organization data
class PolicyRequest(BaseModel):
    prompt: str

@router.post("/apply_policy")
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

        # DO NOT OVERWRITE EXISTING BINDINGS, GRAB THE EXISTING ONES FIRST AND MERGE THEM
        # YOU WILL BRICK THE PROJECT
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

@router.post("/generate_policy")
async def generate_policy(request: PolicyRequest):
    """
    Receives a plain English prompt and returns a generated Google Cloud IAM policy.
    Uses a two-model approach for generation and validation.
    """
    try:
        helpers.logger.info(f"Received policy generation request: {request.prompt[:50]}...")
        
        # First model call: Generate policy with JSON mode
        helpers.logger.info("Making initial call to policy generation model")
        generation_response = await helpers.generate_policy_with_model(request.prompt)
        
        # Extract policy and chat response from generation model
        policy_json = None
        chat_response = None
        validated = False
        
        if "policy" in generation_response:
            policy_json = generation_response["policy"]
            validated = generation_response.get("validate", False)
        
        if "chat_response" in generation_response:
            chat_response = generation_response["chat_response"]
        
        policy = json.dumps(policy_json, indent=2) if policy_json else None
        
        # If a policy was generated and should be validated
        validation_feedback = None
        if policy and validated:
            helpers.logger.info("Policy generated, validating with second model")
            validation_result = await helpers.validate_policy_with_model(policy, request.prompt, chat_response)
            
            # Preserve the chat_response from validation result if it exists
            if "chat_response" in validation_result:
                chat_response = validation_result["chat_response"]
            
            # If policy is invalid, send feedback to generation model
            if not validation_result.get("valid", False):
                validation_feedback = validation_result.get("feedback", "")
                helpers.logger.info(f"Validation failed, regenerating with feedback: {validation_feedback[:50]}...")
                
                # Second generation with validation feedback
                regeneration_response = await helpers.regenerate_policy_with_feedback(
                    request.prompt, 
                    validation_feedback,
                    policy,
                    chat_response
                )
                
                # Update policy and chat response with regenerated values
                if "policy" in regeneration_response:
                    policy_json = regeneration_response["policy"]
                    policy = json.dumps(policy_json, indent=2)
                
                if "chat_response" in regeneration_response:
                    chat_response = regeneration_response["chat_response"]
                    
                    # Add validation feedback if not already included
                    if validation_feedback and validation_feedback not in chat_response:
                        if chat_response:
                            chat_response = f"{chat_response}\n\nValidation feedback: {validation_feedback}"
                        else:
                            chat_response = f"Validation feedback: {validation_feedback}"
        
        helpers.logger.info(f"Returning response: policy_exists={policy is not None}, chat_response_exists={chat_response is not None}")
        return {"policy": policy, "chat_response": chat_response}
            
    except Exception as e:
        helpers.logger.error(f"Error in generate_policy: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating policy: {e}")

@router.get("/get_projects")
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