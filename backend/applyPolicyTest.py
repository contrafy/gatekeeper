from google.oauth2 import service_account
from googleapiclient import discovery

# replace with your project id and service account json path
PROJECT_ID = ''
SERVICE_ACCOUNT_FILE = 'path/to/your-service-account.json'

# create credentials and build the service
credentials = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE)
service = discovery.build('cloudresourcemanager', 'v1', credentials=credentials)

# define a simple policy
policy = {
    "bindings": [
        {
            "role": "roles/editor",
            "members": [
                "user:example@example.com"  # replace with the desired user
            ]
        }
    ]
}

# prepare the request body
body = {
    "policy": policy
}

# apply the policy
request = service.projects().setIamPolicy(resource=PROJECT_ID, body=body)
response = request.execute()
print(response)
