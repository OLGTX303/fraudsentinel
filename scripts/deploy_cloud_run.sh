#!/usr/bin/env bash
# Deploy FraudSentinel (agent + dashboard) to Google Cloud Run as one service.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project <PROJECT_ID>
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com
#
# Usage:
#   PROJECT_ID=my-proj ARIZE_API_KEY=... ARIZE_SPACE_ID=... ./scripts/deploy_cloud_run.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-fraudsentinel}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.0-flash}"

echo "▶ Building container ${IMAGE} ..."
gcloud builds submit --tag "${IMAGE}"

echo "▶ Deploying to Cloud Run (${SERVICE} @ ${REGION}) ..."
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_MODEL=${GEMINI_MODEL},DEMO_MODE=true,ARIZE_API_KEY=${ARIZE_API_KEY:-},ARIZE_SPACE_ID=${ARIZE_SPACE_ID:-},ARIZE_MODEL_ID=${ARIZE_MODEL_ID:-fraudsentinel-v1}"

echo "✓ Done. Service URL:"
gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)'
