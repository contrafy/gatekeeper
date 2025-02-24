#!/usr/bin/env python3
import os
import json
import argparse
import time
from openai import OpenAI

client = OpenAI()

# Ensure your API key is set in your environment variables
# if not openai.api_key:
#    raise ValueError("Please set the OPENAI_API_KEY environment variable.")

# Configurable parameters
GENERATION_MODEL = "gpt-4o-mini"  # Model used for generating synthetic data
VERIFICATION_MODEL = "gpt-4o-mini"  # Model used for verification; can be changed as needed
GENERATION_TEMPERATURE = 0.7
VERIFICATION_TEMPERATURE = 0.0

# Prompts
GENERATION_PROMPT = (
    "You are an expert in Google Cloud IAM policies. "
    "Generate a plain-English request for a policy binding and the corresponding JSON snippet for the policy. "
    "Your response must be valid JSON with exactly two keys: 'query' and 'policy'.\n\n"
    "For example, your output should look like:\n"
    '{\n'
    '  "query": "Generate a policy binding that will grant my companies service account '
    '(service@cloud.google.com) the Project Creator role, as well as any internal resources/services needed through the AI Platform User role.",\n'
    '  "policy": "\\"bindings\\": [\\n  {\\n    \\"role\\": \\"roles/resourcemanager.projectCreator\\",\\n    \\"members\\": [\\n      \\"serviceAccount:service@cloud.google.com\\"\\n    ]\\n  },\\n  {\\n    \\"role\\": \\"roles/aiplatform.user\\",\\n    \\"members\\": [\\n      \\"serviceAccount:service@cloud.google.com\\"\\n    ]\\n  }\\n]"\n'
    '}'
)

# Verification prompt template: takes the generated example as input
VERIFICATION_PROMPT = (
    "You are a Google Cloud IAM expert. Evaluate the following JSON object that contains a 'query' and a 'policy' field. "
    "The 'policy' field is a JSON snippet (as a string) that should correctly implement the policy described in the 'query'.\n\n"
    "Check for the following:\n"
    "1. The JSON object is valid and has exactly two keys: 'query' and 'policy'.\n"
    "2. The 'policy' string is a valid JSON snippet that includes a 'bindings' array with valid role and member definitions.\n"
    "3. The IAM roles and members in the policy align logically with the plain-English 'query'.\n\n"
    "If the example meets these criteria, respond with 'valid'. Otherwise, respond with 'invalid'.\n\n"
    "Example input:\n"
    "{example}\n\n"
    "Your evaluation:"
)

def generate_example():
    """
    Generates a single synthetic example using the generation model.
    Returns the parsed JSON object on success, or None on failure.
    """
    try:
        response = client.chat.completions.create(
            model=GENERATION_MODEL,
            temperature=GENERATION_TEMPERATURE,
            messages=[{"role": "user", "content": GENERATION_PROMPT}]
        )
        generated_text = response.choices[0].message.content.strip()
        # Parse the generated text as JSON
        example = json.loads(generated_text)
        # Basic schema check
        if "query" in example and "policy" in example:
            return example
    except Exception as e:
        print(f"Error during generation: {e}")
    return None

def verify_example(example):
    """
    Verifies a single synthetic example using the verification model.
    Returns True if the example is valid, otherwise False.
    """
    try:
        # Format the verification prompt with the example JSON
        prompt = VERIFICATION_PROMPT.format(example=json.dumps(example, indent=2))
        response = client.chat.completions.create(
            model=VERIFICATION_MODEL,
            temperature=VERIFICATION_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}]
        )
        verdict = response.choices[0].message.content.strip().lower()
        # Consider the example valid if the verdict contains 'valid'
        return "valid" in verdict
    except Exception as e:
        print(f"Error during verification: {e}")
    return False

def main(num_points, output_file):
    valid_examples = []
    attempts = 0

    print(f"Starting generation for {num_points} valid data points...")
    while len(valid_examples) < num_points:
        attempts += 1
        print(f"\nAttempt {attempts}: Generating example...")
        example = generate_example()
        if not example:
            print("Failed to generate a valid JSON example; retrying...")
            continue

        # First verification pass
        print("Running first verification pass...")
        if not verify_example(example):
            print("First verification failed; discarding example.")
            continue

        # Second verification pass
        print("Running second verification pass...")
        if not verify_example(example):
            print("Second verification failed; discarding example.")
            continue

        # If passed both verifications, add to the valid examples list
        print("Example verified successfully!")
        valid_examples.append({
            "prompt": example["query"],
            "completion": example["policy"]
        })

        # Be kind to the API
        time.sleep(1)

    print(f"\nGenerated {len(valid_examples)} valid examples in {attempts} attempts.")
    # Save the examples in JSONL format
    with open(output_file, "w") as f:
        for example in valid_examples:
            f.write(json.dumps(example) + "\n")
    print(f"Saved valid examples to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic IAM policy data for fine-tuning.")
    parser.add_argument(
        "--num-points",
        type=int,
        default=10,
        help="Number of valid synthetic data points to generate."
    )
    parser.add_argument(
        "--output-file",
        type=str,
        default="synthetic_data.jsonl",
        help="Output file to write the JSONL data."
    )
    args = parser.parse_args()
    main(args.num_points, args.output_file)
