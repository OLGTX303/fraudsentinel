# CLAUDE.md — FraudSentinel

This file tells Claude Code how to run, test, and develop FraudSentinel.

## Project structure

```
fraudsentinel/
├── agent/
│   ├── orchestrator.py      ← FastAPI app + investigation pipeline (main entry point)
│   ├── models.py            ← Pydantic data models (Transaction, InvestigationResult, etc.)
│   ├── tools/
│   │   ├── risk_scorer.py   ← ML fraud probability scorer
│   │   ├── rule_engine.py   ← Compliance policy rule evaluator
│   │   ├── threat_feed.py   ← IP/card blocklist checker
│   │   └── history_lookup.py← Account history retrieval
│   └── prompts/
│       └── investigation.py ← Gemini system prompts + SAR prompt builder
├── arize_integration/
│   └── tracer.py            ← Arize span logging, drift monitor, prompt quality
├── data/
│   └── mock_transactions.py ← All 4 demo scenarios + random generator
├── dashboard/               ← React + Vite + Tailwind analyst console (GSAP motion)
│   └── src/
│       ├── App.jsx          ← Shell: sidebar, status bar, view router, socket
│       ├── views.jsx        ← Console · Cases · Trace · Analytics views
│       ├── ui.jsx           ← Shared primitives + charts (donut, histogram, waterfall)
│       ├── icons.jsx        ← Inline SVG icon set
│       └── lib.js           ← API/WebSocket helpers + design tokens
├── scripts/
│   ├── send_test_transaction.py ← CLI to fire test transactions
│   └── train_model.py           ← Train the RandomForest risk model
├── tests/
│   ├── test_tools.py        ← Unit tests for all tools
│   └── test_orchestrator.py ← Integration tests for FastAPI endpoints
├── requirements.txt
└── .env.example
```

## Setup (first time)

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Copy and edit environment variables
cp .env.example .env
# Edit .env — set GOOGLE_API_KEY, or GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT
# Leave ARIZE_* blank to run in local-only observability mode
# DEMO_MODE=true means no real external APIs are called

# 4. (Optional) Train the ML model for better risk scoring
python scripts/train_model.py
```

## Running the system

### Start the agent server
```bash
python -m agent.orchestrator
# Runs on http://localhost:8000
# Auto-reloads on file changes
```

### Start the dashboard (separate terminal)
```bash
cd dashboard
npm install
npm run dev
# Runs on http://localhost:5173
# Proxies /api/* and /ws/* to localhost:8000
```

### Fire a test transaction
```bash
# Single investigation
python scripts/send_test_transaction.py --scenario fraud

# All scenarios
python scripts/send_test_transaction.py --scenario clean
python scripts/send_test_transaction.py --scenario fraud
python scripts/send_test_transaction.py --scenario drift
python scripts/send_test_transaction.py --scenario escalate

# Trigger drift monitor (send 25 high-risk transactions)
python scripts/send_test_transaction.py --scenario drift --repeat 25
```

## Running tests

```bash
# All tests
pytest tests/ -v

# Unit tests only (fast, no server needed)
pytest tests/test_tools.py -v

# Integration tests (uses FastAPI TestClient — no server needed)
pytest tests/test_orchestrator.py -v
```

## API reference

All HTTP endpoints are mounted at both the root and under `/api/*` (the dashboard uses
`/api/*`; the CLI/tests use the root).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Server health + demo mode + active Gemini model |
| GET | /scenarios | Available demo scenarios |
| POST | /investigate | Run a full investigation (sync) |
| GET | /cases?limit=N | Recent investigations (case queue) |
| GET | /cases/{tx_id} | One case detail |
| POST | /feedback | Analyst confirm/override → Arize eval span |
| POST | /simulate | Run a batch of investigations |
| GET | /metrics | Aggregate analytics |
| GET | /trace/{trace_id} | Spans for one investigation |
| GET | /drift-status | Current Arize drift monitor state |
| GET | /spans?limit=N | Recent Arize span log |
| WS | /ws/{client_id} | WebSocket for real-time streaming |

### POST /investigate — example request
```json
{
  "account_id": "ACC-FRAUD-001",
  "amount": 4200.00,
  "currency": "USD",
  "merchant": "ElectroMart Online",
  "merchant_category": "electronics",
  "card_country": "GB",
  "ip_address": "185.220.101.45",
  "ip_country": "MD",
  "device_id": "DEV-UNKNOWN-ZZ",
  "is_international": true,
  "hour_of_day": 3
}
```

### POST /investigate — response shape
```json
{
  "transaction_id": "...",
  "decision": "BLOCK",
  "risk_score": 0.94,
  "reasoning": "...",
  "rule_violations": [...],
  "threat_hits": { "ip_flagged": true, ... },
  "account_history": { "avg_transaction_amount": 85.0, ... },
  "sar_draft": "SUSPICIOUS ACTIVITY REPORT...",
  "processing_ms": 1240,
  "trace_id": "..."
}
```

## WebSocket message protocol

Send:
```json
{ "type": "investigate", "transaction": { ...Transaction fields... } }
```

Send may also include a top-level `"scenario": "fraud"` label for the case queue.

Receive (in order):
```
investigation_start → tool_call → tool_result → (×4 tools)
  → gemini_reasoning (may emit a related_lookup tool_call/result when the agent
    chooses to dig deeper) → reasoning → decision → sar_draft (if BLOCK) → complete
```

## Key design decisions

- **DEMO_MODE=true** — all tool calls use mock data, no external APIs needed
- **No API key fallback** — if no Gemini credentials are configured (`GOOGLE_API_KEY` or Vertex AI), a canned reasoning response is returned so the full pipeline still runs for demos
- **Arize is optional** — if ARIZE_API_KEY is not set, spans are stored in memory and accessible via GET /spans
- **RandomForest model** — if `data/risk_model.joblib` doesn't exist, the heuristic scorer in risk_scorer.py is used automatically
- **WebSocket streaming** — every tool call emits a message so the dashboard can show the investigation live

## Adding a new tool

1. Create `agent/tools/my_tool.py` with a function `my_function(tx: Transaction) -> MyResult`
2. Add `MyResult` to `agent/models.py`
3. Call `await asyncio.to_thread(my_function, tx)` in `agent/orchestrator.py` → `run_investigation()`
4. Add `tracer.log_span("my_tool", inputs, outputs, trace_id)` after the call
5. Add `await emit("tool_call", ...)` and `await emit("tool_result", ...)` for WebSocket streaming
6. Add unit tests in `tests/test_tools.py`

## Deploying to Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/$GOOGLE_CLOUD_PROJECT/fraudsentinel-agent

# Deploy
gcloud run deploy fraudsentinel-agent \
  --image gcr.io/$GOOGLE_CLOUD_PROJECT/fraudsentinel-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,ARIZE_API_KEY=$ARIZE_API_KEY,ARIZE_SPACE_ID=$ARIZE_SPACE_ID

# Build and deploy dashboard to Firebase Hosting
cd dashboard && npm run build
firebase deploy --only hosting
```

## Hackathon notes

- Deadline: June 11, 2026 at 2:00 pm PDT
- Track: Arize Partner Track ($5K / $3K / $2K prizes)
- Demo video should show: clean tx → fraud tx → Arize trace view
- Key differentiator: Arize MCP integrated at EVERY reasoning step, not just final output
- Judges look for: technical depth, design, real-world impact, quality of idea
