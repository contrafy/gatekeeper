from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
import json
import logging
from groq import Groq
from dotenv import load_dotenv
from .prompts import GENERATION_SYSTEM_PROMPT, VALIDATION_SYSTEM_PROMPT

from google.oauth2 import id_token
from google.oauth2.credentials import Credentials
from google.auth.transport import requests as google_requests
from googleapiclient import discovery
from googleapiclient.errors import HttpError
import google.auth

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def gather_gcp_context(project_id: str) -> dict:                      # ⇦ context
    """
    Collects useful IAM context for the given project and prints it.   # ⇦ context
    Currently just logs the data; later you can feed it into the LLM.  # ⇦ context
    """                                                                # ⇦ context
    try:                                                               # ⇦ context
        credentials, _ = google.auth.default()                         # ⇦ context

        iam_service = discovery.build("iam", "v1", credentials=credentials,   # ⇦ context
                                       cache_discovery=False)          # ⇦ context
        crm_service = discovery.build("cloudresourcemanager", "v1",           # ⇦ context
                                       credentials=credentials,        # ⇦ context
                                       cache_discovery=False)          # ⇦ context

        # ---- custom roles --------------------------------------------------# ⇦ context
        custom_roles_resp = iam_service.projects().roles().list(       # ⇦ context
            parent=f"projects/{project_id}"                            # ⇦ context
        ).execute()                                                    # ⇦ context
        custom_roles = [r["name"] for r in custom_roles_resp.get("roles", [])]# ⇦ context

        # ---- service accounts --------------------------------------------- # ⇦ context
        sa_resp = iam_service.projects().serviceAccounts().list(       # ⇦ context
            name=f"projects/{project_id}"                              # ⇦ context
        ).execute()                                                    # ⇦ context
        service_accounts = [sa["email"] for sa in sa_resp.get("accounts", [])]# ⇦ context

        # ---- existing bindings -------------------------------------------- # ⇦ context
        iam_policy = crm_service.projects().getIamPolicy(              # ⇦ context
            resource=project_id, body={}                               # ⇦ context
        ).execute()                                                    # ⇦ context
        bindings = iam_policy.get("bindings", [])                      # ⇦ context

        context_blob = {                                               # ⇦ context
            "customRoles": custom_roles,                               # ⇦ context
            "serviceAccounts": service_accounts,                       # ⇦ context
            "existingBindings": bindings                               # ⇦ context
        }                                                              # ⇦ context

        logger.info("🔍 GCP context collected → %s",                   # ⇦ context
                    json.dumps(context_blob, indent=2))                # ⇦ context
        return context_blob                                            # ⇦ context

    except Exception as ctx_err:                                       # ⇦ context
        logger.warning("Failed to collect GCP context: %s", ctx_err)   # ⇦ context
        return {}                                                      # ⇦ context

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

@app.post("/generate_policy")                                          # ⇦ context
async def generate_policy(request_body: PolicyRequest,                 # ⇦ context
                          request: Request):                           # ⇦ context
    """
    Receives a plain English prompt and returns a generated Google Cloud IAM policy.
    Uses a two-model approach for generation and validation.
    """

    try:
        prompt = request_body.prompt                                   # ⇦ context
        logger.info("Received policy generation request: %s...", prompt[:50])

        # ── NEW: harvest project context if header present ──────────── # ⇦ context
        project_id = request.headers.get("project-id")                 # ⇦ context
        if project_id:                                                 # ⇦ context
            gather_gcp_context(project_id)                             # ⇦ context
        else:                                                          # ⇦ context
            logger.info("No project-id header supplied; skipping context harvest")

        
        # First model call: Generate policy with JSON mode
        logger.info("Making initial call to policy generation model")
        generation_response = await generate_policy_with_model(prompt)
        
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
            logger.info("Policy generated, validating with second model")
            validation_result = await validate_policy_with_model(policy, prompt, chat_response)
            
            # Preserve the chat_response from validation result if it exists
            if "chat_response" in validation_result:
                chat_response = validation_result["chat_response"]
            
            # If policy is invalid, send feedback to generation model
            if not validation_result.get("valid", False):
                validation_feedback = validation_result.get("feedback", "")
                logger.info(f"Validation failed, regenerating with feedback: {validation_feedback[:50]}...")
                
                # Second generation with validation feedback
                regeneration_response = await regenerate_policy_with_feedback(
                    prompt, 
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
        
        logger.info(f"Returning response: policy_exists={policy is not None}, chat_response_exists={chat_response is not None}")
        return {"policy": policy, "chat_response": chat_response}
            
    except Exception as e:
        logger.error(f"Error in generate_policy: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating policy: {e}")

async def generate_policy_with_model(prompt: str):
    """Generate a policy using the first model with JSON mode."""
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,  # Low temperature for more deterministic outputs
            response_format={"type": "json_object"}
        )
        
        response_text = response.choices[0].message.content
        logger.info(f"Generated policy response: {response_text[:100]}...")
        
        # Parse the JSON response
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error from generation model: {str(e)}")
        return {"chat_response": "I encountered an error generating a valid policy. Please try rephrasing your request."}
    except Exception as e:
        logger.error(f"Error in generate_policy_with_model: {str(e)}", exc_info=True)
        return {"chat_response": f"An error occurred: {str(e)}"}

async def validate_policy_with_model(policy: str, original_prompt: str, chat_response: str = None):
    """Validate a policy using the second model with JSON mode."""
    try:
        validation_prompt = f"""
Original request: {original_prompt}

Policy to validate:
{policy}

Original chat_response: {chat_response or ""}

Please validate this policy against Google Cloud IAM best practices and the principle of least privilege.
IMPORTANT: Preserve the original chat_response in your response.
"""
        
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",  # Using the same model for validation
            messages=[
                {"role": "system", "content": VALIDATION_SYSTEM_PROMPT},
                {"role": "user", "content": validation_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        response_text = response.choices[0].message.content
        logger.info(f"Validation response: {response_text[:100]}...")
        
        # Parse the JSON response
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error from validation model: {str(e)}")
        return {"valid": False, "feedback": "I encountered an error validating the policy."}
    except Exception as e:
        logger.error(f"Error in validate_policy_with_model: {str(e)}", exc_info=True)
        return {"valid": False, "feedback": f"An error occurred during validation: {str(e)}"}

async def regenerate_policy_with_feedback(prompt: str, feedback: str, original_policy: str, chat_response: str = None):
    """Regenerate a policy with validation feedback."""
    try:
        regeneration_prompt = f"""
Original request: {prompt}

I generated this policy:
{original_policy}

Original chat_response: {chat_response or ""}

However, validation identified these issues:
{feedback}

Please generate an improved policy that addresses these concerns.
IMPORTANT: Preserve the original chat_response in your response.
"""
        
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": regeneration_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        response_text = response.choices[0].message.content
        logger.info(f"Regenerated policy response: {response_text[:100]}...")
        
        # Parse the JSON response
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error from regeneration model: {str(e)}")
        return {"chat_response": "I encountered an error regenerating a valid policy based on the feedback."}
    except Exception as e:
        logger.error(f"Error in regenerate_policy_with_feedback: {str(e)}", exc_info=True)
        return {"chat_response": f"An error occurred during regeneration: {str(e)}"}

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
    # support token refresh using refresh token header
    refresh_token = request.headers.get("Refresh-Token")
    try:
        id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        if refresh_token:
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri=os.getenv("GOOGLE_OAUTH2_TOKEN_URI", "https://oauth2.googleapis.com/token"),
                client_id=os.getenv("GOOGLE_CLIENT_ID"),
                client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
                scopes=["openid", "email", "profile"],
            )
            try:
                creds.refresh(google_requests.Request())
                token = creds.id_token
                id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
            except Exception as refresh_err:
                raise HTTPException(status_code=401, detail=f"Invalid token after refresh: {refresh_err}")
        else:
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
    # support token refresh using refresh token header
    refresh_token = request.headers.get("Refresh-Token")
    try:
        # Verify the token is valid
        id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        if refresh_token:
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri=os.getenv("GOOGLE_OAUTH2_TOKEN_URI", "https://oauth2.googleapis.com/token"),
                client_id=os.getenv("GOOGLE_CLIENT_ID"),
                client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
                scopes=["openid", "email", "profile"],
            )
            try:
                creds.refresh(google_requests.Request())
                token = creds.id_token
                id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
            except Exception as refresh_err:
                raise HTTPException(status_code=401, detail=f"Invalid token after refresh: {refresh_err}")
        else:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    if not id_info:
        raise HTTPException(status_code=401, detail="Invalid token")
    
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