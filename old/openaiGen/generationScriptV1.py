import os
import json
import argparse
import random
from datetime import datetime, timedelta
import openai
import time
import re

# Load OpenAI API key from environment variable
openai.api_key = os.environ.get("OPENAI_API_KEY")
if not openai.api_key:
    raise ValueError("Please set the OPENAI_API_KEY environment variable")

# Define common GCP roles
ROLES = {
    "project": [
        "roles/owner", 
        "roles/editor", 
        "roles/viewer"
    ],
    "resource_management": [
        "roles/resourcemanager.projectCreator",
        "roles/resourcemanager.organizationAdmin",
        "roles/resourcemanager.folderAdmin"
    ],
    "compute": [
        "roles/compute.instanceAdmin",
        "roles/compute.networkAdmin", 
        "roles/compute.storageAdmin",
        "roles/compute.firewallAdmin",
        "roles/compute.viewer"
    ],
    "storage": [
        "roles/storage.admin",
        "roles/storage.objectCreator",
        "roles/storage.objectViewer",
        "roles/storage.objectAdmin"
    ],
    "bigquery": [
        "roles/bigquery.admin",
        "roles/bigquery.dataEditor",
        "roles/bigquery.dataViewer",
        "roles/bigquery.jobUser"
    ],
    "ai_platform": [
        "roles/aiplatform.user",
        "roles/aiplatform.admin",
        "roles/aiplatform.viewer",
        "roles/aiplatform.trainer",
        "roles/aiplatform.modelUser"
    ],
    "app_engine": [
        "roles/appengine.deployer",
        "roles/appengine.appAdmin",
        "roles/appengine.serviceAdmin",
        "roles/appengine.appViewer"
    ],
    "container": [
        "roles/container.admin",
        "roles/container.developer",
        "roles/container.viewer"
    ],
    "cloud_functions": [
        "roles/cloudfunctions.developer",
        "roles/cloudfunctions.admin",
        "roles/cloudfunctions.viewer"
    ],
    "security": [
        "roles/iam.securityAdmin",
        "roles/iam.securityReviewer",
        "roles/cloudkms.cryptoKeyEncrypterDecrypter"
    ],
    "monitoring": [
        "roles/monitoring.admin",
        "roles/monitoring.viewer",
        "roles/monitoring.metricWriter"
    ],
    "logging": [
        "roles/logging.admin",
        "roles/logging.viewer",
        "roles/logging.logWriter"
    ],
    "cloud_run": [
        "roles/run.admin",
        "roles/run.invoker",
        "roles/run.viewer"
    ],
    "cloud_sql": [
        "roles/cloudsql.admin",
        "roles/cloudsql.client",
        "roles/cloudsql.editor",
        "roles/cloudsql.viewer"
    ],
    "dataflow": [
        "roles/dataflow.admin",
        "roles/dataflow.developer",
        "roles/dataflow.worker",
        "roles/dataflow.viewer"
    ],
    "secret_manager": [
        "roles/secretmanager.admin",
        "roles/secretmanager.secretAccessor",
        "roles/secretmanager.secretVersionManager",
        "roles/secretmanager.viewer"
    ]
}

# Define common member types and placeholders
MEMBER_TYPES = {
    "user": ["user:{email}"],
    "service_account": ["serviceAccount:{email}"],
    "group": ["group:{email}"],
    "domain": ["domain:{domain}"]
}

DOMAINS = ["example.com", "my-org.com", "cloud.google.com"]
PROJECT_IDS = ["my-project", "data-project", "dev-project", "prod-project", 
               "analytics-project", "gke-project", "ai-project", "monitoring-project"]
TEAM_NAMES = ["dev", "ops", "data", "ml", "security", "network", "monitoring", "admin"]
RESOURCE_TYPES = ["instance", "bucket", "database", "function", "cluster", "keyring", "job"]

def generate_random_email(domain=None, prefix=None):
    """Generate a random email address"""
    if domain is None:
        domain = random.choice(DOMAINS)
    
    if prefix is None:
        prefixes = [
            f"{random.choice(TEAM_NAMES)}-{random.choice(['admin', 'user', 'manager'])}",
            f"{random.choice(TEAM_NAMES)}-team",
            f"{random.choice(RESOURCE_TYPES)}-{random.choice(['admin', 'operator'])}",
            f"{random.choice(['data', 'app', 'cloud', 'infra'])}-{random.choice(['dev', 'ops', 'admin'])}"
        ]
        prefix = random.choice(prefixes)
    
    return f"{prefix}@{domain}"

def generate_service_account_email(project_id=None):
    """Generate a service account email"""
    if project_id is None:
        project_id = random.choice(PROJECT_IDS)
    
    sa_prefixes = [
        f"{random.choice(TEAM_NAMES)}-sa",
        f"{random.choice(RESOURCE_TYPES)}-{random.choice(['admin', 'operator', 'manager'])}",
        f"{random.choice(['data', 'app', 'cloud'])}-{random.choice(['service', 'processor', 'agent'])}"
    ]
    
    return f"{random.choice(sa_prefixes)}@{project_id}.iam.gserviceaccount.com"

def generate_future_date():
    """Generate a random future date within the next 3 years"""
    days_ahead = random.randint(30, 365 * 3)
    future_date = datetime.now() + timedelta(days=days_ahead)
    return future_date.strftime("%Y-%m-%d")

def generate_prompt_patterns():
    """Generate patterns for creating natural language policy requests"""
    
    patterns = [
        "Generate a policy binding that will grant {member_type} ({member}) with the {role_name} role",
        "Create a policy where {member_type} {member} has the {role_name} role",
        "I need a policy that allows {member_type} {member} to {action_description} in the project {project_id}",
        "Give {member_type} {member} the {role_name} role ({role_id}) so they can {action_description}",
        "Grant {member_type} {member} the {role_name} role for project {project_id}, expiring on {expiration_date}",
        "I need a policy for {member_type} {member} to have {role_name} access, with expiration on {expiration_date}",
        "The {member_type} {member} needs {role_name} to {action_description}. This access should expire on {expiration_date}",
        "I want a policy such that {member_type} {member} has the role {role_id}. Make this access expire on {expiration_date}",
        "Create a policy that grants {member_type} {member} access to {role_id}",
        "Our {team_description} needs a policy that gives {member_type} {member} the following permissions: {role_id}",
    ]
    
    # More complex patterns with multiple members/roles
    complex_patterns = [
        "Grant {member_type1} {member1} the {role_name1} role, and also give {member_type2} {member2} the {role_name2} role",
        "Create a policy where {member_type1} {member1} and {member_type2} {member2} both have the {role_name} role",
        "I need a policy that allows {member_type} {member} to have both {role_name1} and {role_name2} roles",
        "For our {project_description}, {member_type1} {member1} needs {role_name1}, and {member_type2} {member2} needs {role_name2}. Both should expire on {expiration_date}",
        "The {member_type} {member} requires access to {role_name1}, {role_name2}, and {role_name3}. This access should expire on {expiration_date}",
        "Our {team_description}, represented by {member_type} {member}, needs {role_name1} and {role_name2} roles across all projects within the organization",
        "I need a policy for {member_type1} {member1} to have {role_name1} and {member_type2} {member2} to have {role_name2}. The first role should expire on {expiration_date1}, and the second on {expiration_date2}"
    ]
    
    return patterns + complex_patterns

def generate_action_descriptions():
    """Generate action descriptions for different roles"""
    
    actions = {
        "roles/resourcemanager.projectCreator": "create new projects",
        "roles/resourcemanager.organizationAdmin": "manage the organization",
        "roles/owner": "have full control over all resources",
        "roles/editor": "edit resources",
        "roles/viewer": "view resources",
        "roles/compute.instanceAdmin": "manage compute instances",
        "roles/compute.networkAdmin": "manage VPC networks",
        "roles/storage.objectCreator": "upload files to storage buckets",
        "roles/storage.objectViewer": "view files in storage buckets",
        "roles/bigquery.dataEditor": "edit data in BigQuery datasets",
        "roles/bigquery.dataViewer": "query data in BigQuery",
        "roles/aiplatform.user": "use AI Platform services",
        "roles/appengine.deployer": "deploy applications to App Engine",
        "roles/container.admin": "administer Kubernetes clusters",
        "roles/cloudfunctions.developer": "deploy Cloud Functions",
        "roles/iam.securityAdmin": "manage security policies",
        "roles/cloudkms.cryptoKeyEncrypterDecrypter": "encrypt and decrypt using KMS keys",
        "roles/monitoring.admin": "configure monitoring",
        "roles/logging.viewer": "view logs",
        "roles/run.admin": "administer Cloud Run services",
        "roles/cloudsql.admin": "administer Cloud SQL instances",
        "roles/dataflow.developer": "develop Dataflow jobs",
        "roles/secretmanager.secretAccessor": "access secrets"
    }
    
    # Add generic descriptions for other roles
    for category, role_list in ROLES.items():
        for role in role_list:
            if role not in actions:
                role_name = role.split("/")[-1].replace(".", " ").title()
                actions[role] = f"perform {role_name} operations"
    
    return actions

def generate_team_descriptions():
    """Generate descriptions for teams requesting access"""
    
    descriptions = [
        "security team",
        "development team",
        "operations team",
        "data science team",
        "infrastructure team",
        "network administration team",
        "cloud architecture team",
        "application development team",
        "DevOps team",
        "SRE team",
        "analytics team",
        "machine learning team",
        "monitoring team",
        "automation team"
    ]
    
    return descriptions

def generate_policy_request():
    """Generate a random policy request with corresponding expected output"""
    
    # Decide on complexity level
    complexity = random.choices(
        ["simple", "condition", "multi_role", "multi_member", "complex"], 
        weights=[0.3, 0.2, 0.2, 0.2, 0.1]
    )[0]
    
    # Initialize variables
    bindings = []
    has_condition = False
    member_count = 1
    role_count = 1
    
    # Set complexity parameters
    if complexity == "condition":
        has_condition = True
    elif complexity == "multi_role":
        role_count = random.randint(2, 3)
    elif complexity == "multi_member":
        member_count = random.randint(2, 3)
    elif complexity == "complex":
        has_condition = random.random() > 0.5
        role_count = random.randint(1, 3)
        member_count = random.randint(1, 3)
    
    # Generate members
    members = []
    member_types = []
    for i in range(member_count):
        member_type = random.choices(
            ["user", "service_account", "group"],
            weights=[0.4, 0.4, 0.2]
        )[0]
        member_types.append(member_type)
        
        if member_type == "user":
            members.append(generate_random_email())
        elif member_type == "service_account":
            members.append(generate_service_account_email())
        elif member_type == "group":
            members.append(generate_random_email(prefix=f"{random.choice(TEAM_NAMES)}-team"))
    
    # Generate roles
    roles = []
    role_names = []
    categories = list(ROLES.keys())
    
    for i in range(role_count):
        category = random.choice(categories)
        role = random.choice(ROLES[category])
        roles.append(role)
        role_names.append(role.split("/")[-1].replace(".", " ").title())
    
    # Generate condition (if applicable)
    condition = None
    expiration_date = None
    if has_condition:
        expiration_date = generate_future_date()
        next_day = (datetime.strptime(expiration_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        condition = {
            "title": "Expiration Condition",
            "description": f"Expires on {expiration_date}",
            "expression": f"request.time < timestamp('{next_day}T00:00:00.000Z')"
        }
    
    # Generate policy bindings
    if complexity in ["simple", "condition"]:
        # Simple case - one role, one or more members
        binding = {
            "role": roles[0],
            "members": [f"{member_type}:{member}" for member_type, member in zip(member_types, members)]
        }
        if condition:
            binding["condition"] = condition
        bindings.append(binding)
    elif complexity == "multi_role":
        # Multiple roles, similar members
        for role in roles:
            binding = {
                "role": role,
                "members": [f"{member_type}:{member}" for member_type, member in zip(member_types, members)]
            }
            if condition:
                binding["condition"] = condition
            bindings.append(binding)
    elif complexity in ["multi_member", "complex"]:
        # Could be more complex combinations
        if random.random() > 0.5 and len(roles) > 1:
            # Different members get different roles
            for i, (member_type, member) in enumerate(zip(member_types, members)):
                role_idx = min(i, len(roles) - 1)
                binding = {
                    "role": roles[role_idx],
                    "members": [f"{member_type}:{member}"]
                }
                if condition and (random.random() > 0.3 or i == 0):  # Some might not have conditions
                    binding["condition"] = condition
                bindings.append(binding)
        else:
            # One binding with multiple members
            binding = {
                "role": random.choice(roles),
                "members": [f"{member_type}:{member}" for member_type, member in zip(member_types, members)]
            }
            if condition:
                binding["condition"] = condition
            bindings.append(binding)
    
    # Create the policy JSON
    policy = {
        "bindings": bindings
    }
    
    # Generate a natural language request
    action_descriptions = generate_action_descriptions()
    project_id = random.choice(PROJECT_IDS)
    
    # Choose request template based on complexity
    patterns = generate_prompt_patterns()
    if complexity == "simple":
        pattern = random.choice(patterns[:5])
    elif complexity == "condition":
        pattern = random.choice(patterns[5:10])
    else:
        pattern = random.choice(patterns[10:])
    
    # Create request text with proper substitutions
    request_text = pattern
    
    # Basic substitutions
    if "{member_type}" in request_text:
        member_type_text = "user" if member_types[0] == "user" else \
                          "service account" if member_types[0] == "service_account" else "group"
        request_text = request_text.replace("{member_type}", member_type_text)
    
    if "{member}" in request_text:
        request_text = request_text.replace("{member}", members[0])
    
    if "{role_name}" in request_text:
        role_display = roles[0].split("/")[-1].replace(".", " ").title()
        request_text = request_text.replace("{role_name}", role_display)
    
    if "{role_id}" in request_text:
        request_text = request_text.replace("{role_id}", roles[0])
    
    if "{project_id}" in request_text:
        request_text = request_text.replace("{project_id}", project_id)
    
    if "{action_description}" in request_text:
        action = action_descriptions.get(roles[0], "perform actions")
        request_text = request_text.replace("{action_description}", action)
    
    if "{expiration_date}" in request_text and expiration_date:
        request_text = request_text.replace("{expiration_date}", expiration_date)
    
    # More complex substitutions
    if "{member_type1}" in request_text and len(member_types) > 1:
        member_type_text1 = "user" if member_types[0] == "user" else \
                           "service account" if member_types[0] == "service_account" else "group"
        request_text = request_text.replace("{member_type1}", member_type_text1)
        
        member_type_text2 = "user" if member_types[1] == "user" else \
                           "service account" if member_types[1] == "service_account" else "group"
        request_text = request_text.replace("{member_type2}", member_type_text2)
        
        request_text = request_text.replace("{member1}", members[0])
        request_text = request_text.replace("{member2}", members[1])
    
    # Find all placeholders in the request text
        placeholders = re.findall(r"{([^}]+)}", request_text)

        # Replace role name placeholders
        for i, placeholder in enumerate(placeholders):
          if placeholder.startswith("role_name"):
            idx = int(placeholder.replace("role_name", "")) - 1
            if idx < len(roles):
                role_display = roles[idx].split("/")[-1].replace(".", " ").title()
                request_text = request_text.replace(f"{{{placeholder}}}", role_display)
            else:
                # Fall back to a generic role name if index out of bounds
                role_display = "Custom Role"
                request_text = request_text.replace(f"{{{placeholder}}}", role_display)
    
    if "{expiration_date1}" in request_text and expiration_date:
        date1 = expiration_date
        date2 = (datetime.strptime(expiration_date, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d")
        request_text = request_text.replace("{expiration_date1}", date1)
        request_text = request_text.replace("{expiration_date2}", date2)
    
    if "{team_description}" in request_text:
        team_descriptions = generate_team_descriptions()
        request_text = request_text.replace("{team_description}", random.choice(team_descriptions))
    
    if "{project_description}" in request_text:
        project_descriptions = ["data analytics platform", "cloud infrastructure", "development environment", 
                              "AI testing platform", "security monitoring system", "application deployment pipeline"]
        request_text = request_text.replace("{project_description}", random.choice(project_descriptions))
    
    # Format policy JSON as a string (matching the expected output format)
    policy_str = json.dumps(policy, indent=2).replace('"', '""')
    
    return {
        "request_text": request_text,
        "policy": policy_str
    }

def validate_no_placeholders(examples):
    """Ensure no placeholders remain in the examples"""
    cleaned_examples = []
    
    for example in examples:
        request_text = example["request_text"]
        policy = example["policy"]
        
        # Check for placeholders in request text
        request_placeholders = re.findall(r"{([^}]+)}", request_text)
        if request_placeholders:
            print(f"Warning: Found placeholders in request: {request_placeholders}")
            
            # Replace any remaining placeholders with realistic values
            for placeholder in request_placeholders:
                if "date" in placeholder or "expiration" in placeholder:
                    request_text = request_text.replace(f"{{{placeholder}}}", "2025-12-31")
                elif "role" in placeholder:
                    if "name" in placeholder:
                        request_text = request_text.replace(f"{{{placeholder}}}", "Storage Object Viewer")
                    else:
                        request_text = request_text.replace(f"{{{placeholder}}}", "roles/storage.objectViewer")
                elif "member" in placeholder:
                    if "type" in placeholder:
                        request_text = request_text.replace(f"{{{placeholder}}}", "user")
                    else:
                        request_text = request_text.replace(f"{{{placeholder}}}", "user@example.com")
                elif "action" in placeholder:
                    request_text = request_text.replace(f"{{{placeholder}}}", "access and manage resources")
                elif "project" in placeholder:
                    request_text = request_text.replace(f"{{{placeholder}}}", "my-project")
                elif "team" in placeholder:
                    request_text = request_text.replace(f"{{{placeholder}}}", "development team")
                else:
                    request_text = request_text.replace(f"{{{placeholder}}}", f"sample_{placeholder}")
        
        cleaned_examples.append({
            "request_text": request_text,
            "policy": policy
        })
    
    return cleaned_examples

def generate_data_with_openai(num_examples=10, model="gpt-4o-mini"):
    """Generate synthetic data using OpenAI API for validation"""
    
    # First create our own synthetic examples
    examples = [generate_policy_request() for _ in range(num_examples)]
    
    # For a subset, use OpenAI to validate and potentially improve the examples
    validated_examples = []
    
    for i, example in enumerate(examples):
        print(f"Processing example {i+1}/{len(examples)}...")
        
        request_text = example["request_text"]
        expected_policy = example["policy"]
        
        system_prompt = """
        You are an expert in Google Cloud IAM policies. Your task is to convert natural language requests 
        into correctly formatted GCloud IAM policy bindings JSON. The output should be a valid JSON 
        policy that can be absorbed by the GCloud IAM API. The policy should define bindings of roles 
        to members (users, service accounts, or groups) and may include conditions such as time-based 
        expirations. Ensure all role names are fully qualified (e.g., roles/storage.objectViewer).
        """
        
        try:
            response = openai.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request_text}
                ],
                temperature=0.2,
                max_tokens=1000
            )
            
            generated_policy = response.choices[0].message.content.strip()
            
            # Try to extract just the JSON portion if there's explanatory text
            try:
                # Look for JSON-like content within triple backticks
                import re
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', generated_policy)
                if json_match:
                    generated_policy = json_match.group(1).strip()
                
                # Or find content within curly braces if not already JSON parseable
                try:
                    json.loads(generated_policy)
                except:
                    json_match = re.search(r'({[\s\S]*})', generated_policy)
                    if json_match:
                        generated_policy = json_match.group(1).strip()
            except:
                pass
            
            # Format consistent with our expected output
            try:
                parsed = json.loads(generated_policy)
                formatted_policy = json.dumps(parsed, indent=2).replace('"', '""')
            except:
                # If we can't parse it, use the original expected policy
                formatted_policy = expected_policy
                
            validated_examples.append({
                "request_text": request_text,
                "policy": formatted_policy
            })
            
            # Respect rate limits
            time.sleep(0.5)
            
        except Exception as e:
            print(f"Error generating example {i+1}: {str(e)}")
            validated_examples.append(example)  # Use the original example on error
            time.sleep(1)  # Longer wait on error
    
    return validated_examples

def format_for_openai_finetuning(examples):
    """Format examples for OpenAI fine-tuning"""
    
    formatted_data = []
    
    for example in examples:
        formatted_data.append({
            "messages": [
                {"role": "system", "content": "You are an expert in Google Cloud IAM policies. Convert natural language requests into correctly formatted GCloud IAM policy bindings JSON."},
                {"role": "user", "content": example["request_text"]},
                {"role": "assistant", "content": example["policy"]}
            ]
        })
    
    return formatted_data

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic GCP IAM policy data")
    parser.add_argument("--num_examples", type=int, default=100, 
                        help="Number of examples to generate")
    parser.add_argument("--output_file", type=str, default="policy_data.jsonl",
                        help="Output file name")
    parser.add_argument("--use_openai", action="store_true",
                        help="Use OpenAI API to validate and improve examples")
    parser.add_argument("--model", type=str, default="gpt-4o-mini",
                        help="OpenAI model to use if --use_openai is specified")
    
    args = parser.parse_args()
    
    print(f"Generating {args.num_examples} synthetic IAM policy examples...")
    
    if args.use_openai:
        examples = generate_data_with_openai(args.num_examples, args.model)
    else:
        raw_examples = [generate_policy_request() for _ in range(args.num_examples)]
        examples = validate_no_placeholders(raw_examples)
    
    # Format data for OpenAI fine-tuning
    formatted_data = format_for_openai_finetuning(examples)
    
    # Save to JSONL file
    with open(args.output_file, "w") as f:
        for item in formatted_data:
            f.write(json.dumps(item) + "\n")
    
    print(f"Generated {len(examples)} examples and saved to {args.output_file}")
    
    # Also save a CSV version for easier inspection
    csv_file = args.output_file.replace(".jsonl", ".csv")
    with open(csv_file, "w") as f:
        f.write("Request Text,Response Policy\n")
        for example in examples:
            request = example["request_text"].replace('"', '""')
            policy = example["policy"].replace('"', '""')
            f.write(f'"{request}","{policy}"\n')
    
    print(f"Also saved data in CSV format to {csv_file}")

if __name__ == "__main__":
    main()
