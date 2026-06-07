"""
Deploy FraudSentinel to **Vertex AI Agent Engine** (Google "Agent Platform").

Run this under YOUR Google Cloud login (it can't be done from a sandbox):

    gcloud auth application-default login
    gcloud config set project YOUR_PROJECT_ID
    gcloud services enable aiplatform.googleapis.com storage.googleapis.com

    pip install "google-cloud-aiplatform[agent_engines,adk]" google-adk

    GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID \
    STAGING_BUCKET=gs://YOUR_BUCKET \
    ARIZE_API_KEY=... ARIZE_SPACE_ID=... \
      python -m agent_engine.deploy

It packages the ADK agent in agent_engine/agent.py (which reuses the web app's
tested tool logic) and creates a managed Agent Engine. The script prints the
resource name + console URL when done.
"""
from __future__ import annotations
import os

import vertexai
from vertexai import agent_engines
from vertexai.preview import reasoning_engines

from agent_engine.agent import root_agent

PROJECT = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
STAGING_BUCKET = os.environ["STAGING_BUCKET"]  # e.g. gs://my-bucket


def main():
    vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Wrap the ADK agent. enable_tracing exports OpenInference spans — the same
    # protocol Arize ingests, so Agent Engine traces flow to your Arize space too.
    app = reasoning_engines.AdkApp(agent=root_agent, enable_tracing=True)

    remote_agent = agent_engines.create(
        agent_engine=app,
        display_name="FraudSentinel",
        description="Autonomous fraud investigation agent (Gemini + Arize).",
        # Bundle the shared logic + ML model so the agent runs the real rules.
        extra_packages=["agent", "data", "arize_integration", "agent_engine"],
        requirements=[
            "google-cloud-aiplatform[agent_engines,adk]",
            "google-adk",
            "pydantic==2.7.1",
            "scikit-learn==1.4.2",
            "numpy==1.26.4",
            "joblib==1.4.2",
            "arize-otel==0.7.0",
            "openinference-semantic-conventions==0.1.14",
        ],
        env_vars={
            "DEMO_MODE": "true",
            "ARIZE_API_KEY": os.getenv("ARIZE_API_KEY", ""),
            "ARIZE_SPACE_ID": os.getenv("ARIZE_SPACE_ID", ""),
            "ARIZE_MODEL_ID": os.getenv("ARIZE_MODEL_ID", "fraudsentinel-v1"),
        },
    )

    print("\n✓ Deployed to Agent Engine")
    print("  resource:", remote_agent.resource_name)
    print("  console : https://console.cloud.google.com/vertex-ai/agents/agent-engines"
          f"?project={PROJECT}")

    # Smoke test the remote agent
    print("\nQuerying the remote agent...")
    for event in remote_agent.stream_query(
        user_id="analyst",
        message="Investigate: account ACC-FRAUD-001, $4200 at ElectroMart, card GB, "
                "IP 185.220.101.45 (MD), device DEV-UNKNOWN-ZZ, 03:00, international, "
                "card_token 4111111111111111.",
    ):
        print(event)


if __name__ == "__main__":
    main()
