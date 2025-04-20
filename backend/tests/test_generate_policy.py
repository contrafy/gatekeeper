# backend/tests/test_generate_policy.py
import json, pytest
from types import SimpleNamespace as NS

def fake_groq_resp(text: str):
    """
    Build something that looks like:
       {"choices": [{"message": {"content": text}}]}
    with attribute access (dot notation) not dicts.
    """
    return NS(choices=[NS(message=NS(content=text))])

# ---------------- SUNNY -----------------
@pytest.mark.asyncio
async def test_generate_policy_success(client, monkeypatch):
    payload_json = json.dumps({"bindings": []})
    monkeypatch.setattr(
        "app.main.groq_client.chat.completions.create",
        lambda *a, **k: fake_groq_resp(payload_json),
    )

    resp = await client.post("/generate_policy", json={"prompt": "dummy"})
    assert resp.status_code == 200
    assert json.loads(resp.json()["policy"]) == {"bindings": []}