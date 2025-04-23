# Gatekeeper

**Senior Capstone Project**  
_Course: CSCE 482 – 934_  
**Team Members:**  
- Ahmad Raaiyan (CEO)  
- Aum Palande (CTO)  
- John‑Carlos Breck Ortiz  
- David‑Tyler Ighedosa  

---

## What is Gatekeeper? Why is this necessary?
Gatekeeper is a web-based tool that uses a fine-tuned Large Language Model to generate, verify, and apply Google Cloud IAM policies prompts. Manually configuring GCP’s many fine‑grained IAM roles is error‑prone and time‑consuming; Gatekeeper automates policy creation and ensures correctness before applying to your organization.

---

# Tech Stack
- **Frontend:** React with Vite and custom Material Design-inspired UI
- **Backend:** FastAPI (Python 3) with OpenAI API integration
- **LLM Services:** OpenAI API for policy generation
- **Deployment Tools:** Uvicorn for local server; npm for frontend package management

---

## Features
- **Fine Tuned Model:** Utilizes a fined-tuned model for highly accurate policy generation
- **Natural‑Language Prompts:** Describe desired policies in plain English  
- **Policy Generation:** LLM produces IAM policy JSON, ready for GCP import  
- **Verification:** Heuristic checks to catch errors before applying  
- **Automatic Apply:** Sends approved policies to Google Cloud API  

---

## Local Build & Deploy Instructions

### Backend (Terminal 1)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

### Frontend (Terminal 2)
```bash
cd frontend
bun install
bun start

## Known Issues
- **API Downtime: Outages in Google Gemini or Cloud IAM APIs will block policy generation or application (errors are caught but functionality is unavailable).
- **Prompt Specificity: Broad prompts may yield incomplete policies; detailed input improves accuracy.