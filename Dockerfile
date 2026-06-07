# ── Stage 1: build the React dashboard ────────────────────────────
FROM node:20-slim AS dashboard
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm install
COPY dashboard/ ./
RUN npm run build

# ── Stage 2: Python agent + bundled dashboard ─────────────────────
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AGENT_HOST=0.0.0.0

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY agent/ ./agent/
COPY arize_integration/ ./arize_integration/
COPY data/ ./data/
COPY scripts/ ./scripts/

# Bundle the compiled dashboard so FastAPI serves it at "/"
COPY --from=dashboard /app/dashboard/dist ./dashboard/dist

# Cloud Run injects $PORT; default to 8000 for local `docker run`.
ENV AGENT_PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn agent.orchestrator:app --host 0.0.0.0 --port ${PORT:-8080}"]
