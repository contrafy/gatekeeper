import logging
import os
import json

import prompts

from openai import OpenAI
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

openai_client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
# check for GROQ_API_KEY
groq_client = Groq()

async def generate_policy_with_model(prompt: str):
    """Generate a policy using the first model with JSON mode."""
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": prompts.GENERATION_SYSTEM_PROMPT},
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
                {"role": "system", "content": prompts.VALIDATION_SYSTEM_PROMPT},
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
                {"role": "system", "content": prompts.GENERATION_SYSTEM_PROMPT},
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