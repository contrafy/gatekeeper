import logging
import os
import json

from openai import OpenAI
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize API clients
openai_client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
# By default this constructor uses: os.getenv("GROQ_API_KEY") for the key
groq_client = Groq()

# System prompt for generator model that outputs in JSON mode
def generate_system_prompt():
    return """
You are a specialized AI assistant focused on generating Google Cloud IAM policies in valid JSON format.

Your response must be a valid JSON object with the following structure:
{
  "policy": {
    "bindings": [
      {
        "role": "roles/[ROLE_NAME]",
        "members": [
          "[MEMBER_TYPE]:[IDENTIFIER]"
        ]
      }
    ]
  },
  "chat_response": "string", // Optional explanation or questions (only include if necessary)
  "validate": true // Always include this field with value true if you've generated a policy
}

Key Requirements:
1. Always output valid JSON that follows Google Cloud IAM binding structure
2. Include only recognized Google Cloud predefined roles or custom roles (starting with 'custom.')
3. Use exact role names from Google Cloud's role hierarchy (e.g., 'roles/resource.dataViewer' or 'roles/resource.admin')
4. Support various member types: user:, serviceAccount:, group:, domain:
5. Follow principle of least privilege.
6. Generate policies for the specific resource mentioned or default to project level
7. Validate all role names against Google Cloud's standard nomenclature
8. Include NO pleasantries or unnecessary text
9. Only include "chat_response" when:
   - You need more information to generate a policy
   - You need to explain placeholder values that require replacement
   - You need to clarify ambiguities in the user's request
10. Set "validate" to true when you've generated a policy that should be validated

Additional Instructions:
- Always prefix service accounts with 'serviceAccount:'
- Always prefix user emails with 'user:'
- Always prefix groups with 'group:'
- Always prefix domains with 'domain:'
- For organizational policies, include 'organization/[ORG_ID]' in the resource
- For project-level policies, include 'projects/[PROJECT_ID]' in the resource
- For folder-level policies, include 'folders/[FOLDER_ID]' in the resource

If you cannot generate a valid policy because you need more information, omit the "policy" field entirely and use "chat_response" to ask for the required information. Do not respond with any policies that are not 100% what the user is asking for.
"""

# System prompt for validator model that outputs in JSON mode
def generate_validator_prompt():
    return """
You are a specialized Google Cloud IAM policy validator that outputs in valid JSON format.

Your response must be a valid JSON object with the following structure:
{
  "valid": boolean, // true if the policy is valid, false otherwise
  "feedback": "string", // Detailed feedback on policy issues (only if valid is false)
  "chat_response": "string", // IMPORTANT: Always preserve the original chat_response if provided to you
  "suggested_fixes": { // Optional suggested policy fixes (only if valid is false)
    "bindings": [
      {
        "role": "roles/[ROLE_NAME]",
        "members": [
          "[MEMBER_TYPE]:[IDENTIFIER]"
        ]
      }
    ]
  }
}

Validate policies against these criteria:
1. Syntactic correctness (valid JSON structure)
2. Presence of required fields and structures
3. Principle of least privilege (no unnecessary permissions)
4. No overly permissive wildcards or admin roles without clear justification
5. Proper role naming according to Google Cloud standards (e.g., roles/viewer, roles/editor)
6. Proper member formatting (user:, serviceAccount:, group:, domain:)
7. Logical consistency
8. Security best practices

IMPORTANT: You will receive any chat_response from the first model in your input. ALWAYS preserve this in your "chat_response" field.

If the policy is valid, return {"valid": true, "chat_response": "original chat response here"}.
If invalid, provide specific feedback explaining all issues and suggested fixes if possible.
"""

async def generate_policy_with_model(prompt: str):
    """Generate a policy using the first model with JSON mode."""
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": generate_system_prompt()},
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
                {"role": "system", "content": generate_validator_prompt()},
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
                {"role": "system", "content": generate_system_prompt()},
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