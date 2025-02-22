from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import openai
import os
from dotenv import load_dotenv

# Load environment variables from a .env file if available
load_dotenv()

app = FastAPI(title="Google Cloud IAM Policy Generator")

# Set your OpenAI API key (ensure this is in your .env file as OPENAI_API_KEY)
openai.api_key = os.getenv("OPENAI_API_KEY")

class PolicyRequest(BaseModel):
    prompt: str

@app.post("/generate_policy")
async def generate_policy(request: PolicyRequest):
    """
    Receives a plain English prompt and returns a generated Google Cloud IAM policy.
    """
    try:
        response = openai.Completion.create(
            engine="text-davinci-003",  # or another engine of your choice
            prompt=request.prompt,
            max_tokens=150,
            temperature=0.5,
        )
        policy = response.choices[0].text.strip()
        return {"policy": policy}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating policy: {e}")
