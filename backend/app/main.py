from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv

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
