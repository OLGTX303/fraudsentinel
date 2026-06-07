# FraudSentinel on Google Agent Platform (Vertex AI Agent Engine)

This packages the FraudSentinel agent as an **ADK (Agent Development Kit)** agent and
deploys it to **Vertex AI Agent Engine** — the runtime behind
`console.cloud.google.com/agent-platform`. The agent reuses the *same tested tool logic*
as the web app (`agent/tools/*`), so there's one source of truth.

> **What runs where**
> - **Agent Engine** hosts the *agent brain* (Gemini + tools, reasoning) — this folder.
> - **Cloud Run** hosts the *analyst console* (React dashboard + API) — see repo root
>   `Dockerfile` / `scripts/deploy_cloud_run.sh`.
> The dashboard can call either its own pipeline or the deployed Agent Engine.

---

## 0. Prerequisites (one time, under YOUR Google login)

```bash
# Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# Enable the APIs Agent Engine needs
gcloud services enable aiplatform.googleapis.com storage.googleapis.com

# A staging bucket for the agent package
gsutil mb -l us-central1 gs://YOUR_PROJECT_ID-fraudsentinel

# Python deps
pip install "google-cloud-aiplatform[agent_engines,adk]" google-adk
pip install -r requirements.txt
```

## 1. Try the agent locally first (optional but recommended)

```bash
# from the repo root (fraudsentinel/)
adk run agent_engine        # terminal chat with the agent
# or a local web UI:
adk web                     # then open the printed URL, pick "fraudsentinel"
```

Ask it: *"Investigate $4,200 at ElectroMart, card GB, IP 185.220.101.45 (MD), new device,
3am, card_token 4111111111111111."* → it should call the tools and return **BLOCK**.

## 2. Deploy to Agent Engine

```bash
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID \
GOOGLE_CLOUD_LOCATION=us-central1 \
STAGING_BUCKET=gs://YOUR_PROJECT_ID-fraudsentinel \
ARIZE_API_KEY=ak-... ARIZE_SPACE_ID=U3BhY2U6... \
  python -m agent_engine.deploy
```

The script prints the **resource name** and the **Agent Engine console URL**. It also runs
a smoke query against the deployed agent. Traces (`enable_tracing=True`) export as
OpenInference spans — the same protocol your Arize space ingests.

## 3. (Optional) Call the deployed agent from code

```python
from vertexai import agent_engines
agent = agent_engines.get("projects/.../locations/us-central1/reasoningEngines/123...")
for event in agent.stream_query(user_id="analyst", message="Investigate ..."):
    print(event)
```

You can point the dashboard's backend at this resource instead of the local pipeline.

---

## Notes & honest caveats
- **You must run step 2 yourself** — deployment requires your authenticated Google Cloud
  session; it can't be done from a sandbox.
- `agent_engine/agent.py` defines `root_agent` (ADK `Agent`). The tool functions wrap the
  repo's tested logic, so behaviour matches the web app.
- For the hackathon's **hosted URL** requirement, the simplest path is still Cloud Run
  (`scripts/deploy_cloud_run.sh`), which hosts the full console. Agent Engine is the
  stronger "Agent Builder / Agent Platform" story for the judging rubric; use both.
