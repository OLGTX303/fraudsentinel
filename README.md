<div align="center">

# 🛡️ FraudSentinel

### Real-time fraud-investigation **agent** — Google **Gemini** + **Arize** on **Google Cloud**

[![Hackathon](https://img.shields.io/badge/Google%20Cloud-Rapid%20Agent%20Hackathon-4285F4)](https://rapid-agent.devpost.com/)
[![Track](https://img.shields.io/badge/Partner%20Track-Arize-f0b429)](https://arize.com/)
[![Model](https://img.shields.io/badge/Gemini-2.5%20Flash-1a73e8)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/license-MIT-3fb950)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-43%20passing-3fb950)](tests/)

**Live demo →** **https://fraudsentinel.olgtx.dpdns.org**

</div>

---

FraudSentinel is an autonomous agent for the **financial-services** challenge. When a
suspicious payment fires, it investigates like a human fraud analyst would, reasons over the
evidence with **Gemini**, takes an action (allow / flag / block), drafts a regulator-ready
Suspicious Activity Report — and exports **every step as an Arize trace** so the whole
decision is auditable and monitorable for drift. End-to-end in under two seconds.

## Why this is an *agent*, not a chatbot

1. **Plans & gathers** — calls four tools (account history, ML risk scorer, compliance rule
   engine, threat-feed lookup) to build an evidence dossier.
2. **Reasons agentically** — Gemini **decides its own tool use** via function calling; when
   the evidence is ambiguous it autonomously runs a deeper `lookup_related_transactions`
   check before committing to **ALLOW / FLAG / BLOCK** with key signals and a plain-English
   justification. *(Falls back to a deterministic evidence heuristic when no Gemini
   credentials/quota are present, so the demo always runs.)*
3. **Acts** — blocks/flags instantly and, on a BLOCK, autonomously drafts a FinCEN-style SAR.
4. **Observes itself** — every tool call and LLM completion is exported to **Arize** as an
   OpenTelemetry / OpenInference span; a PSI drift monitor watches the risk-score
   distribution and an evaluator scores SAR quality.
5. **Learns from humans** — analysts confirm or override each decision; that feedback is
   logged to Arize as an agreement label, closing the loop.

## ✨ Features

| | |
|---|---|
| 🤖 **Agentic reasoning** | Gemini function-calling plans tool use, then decides ALLOW/FLAG/BLOCK |
| 🔭 **Real Arize tracing** | OpenInference spans exported to `otlp.arize.com` (verified live) |
| 💳 **Interactive payment tester** | Real **Card / Apple Pay / Google Pay / PayPal** forms & buttons that fire live checks |
| 🌐 **Broadband-only network rule** | Refuses datacenter / IDC / VPN IPs; accepts home & business broadband |
| 📊 **4-view analyst console** | Console · Cases · Trace (OpenInference waterfall) · Analytics |
| 💬 **Streaming chatbot** | SSE assistant that streams the payment-check details |
| 🌗 **Sunset-aware theme** | Auto light/dark by your local sunrise/sunset (suncalc), with manual toggle |
| 📝 **Auto SAR drafting** | FinCEN-style Suspicious Activity Report on every block |
| 🔐 **Locked-down auth** | Single demo account, password validated server-side, token-gated API + WebSocket |
| 🚦 **Per-IP rate limiting** | Protects the shared demo (and the Gemini budget) across countries |
| 🎞️ **Polished motion** | GSAP + React-Bits-style aurora background & gradient text |

## Architecture

```
                 ┌──────────────── FraudSentinel agent (FastAPI) ────────────────┐
 Payment ──────► │  run_investigation()                                          │
 (card / wallet) │   ├─ 1. account_history      (tool)                           │
                 │   ├─ 2. risk_scorer           (RandomForest / heuristic ML)    │
                 │   ├─ 3. rule_engine           (AML + datacenter-IP policy)     │
                 │   ├─ 4. threat_feed           (IP / card blocklist)            │
                 │   ├─ 5. Gemini reasoning  ── google-genai → Vertex AI / Gemini │
                 │   │        └─ may call related_transactions (agentic)          │
                 │   └─ 6. SAR drafter           (Gemini, only on BLOCK)          │
                 └───────────────┬───────────────────────────────┬───────────────┘
                                 │ every span                     │ WebSocket / SSE
                                 ▼                                ▼
                   Arize (OpenInference / OTel)         React console (Vite + Tailwind + GSAP)
                   ├─ per-investigation trace tree       ├─ Console: payment tester + live trace
                   ├─ PSI model-drift monitor            ├─ Cases: queue + human override
                   └─ SAR prompt-quality evals           ├─ Trace: OpenInference waterfall
                                                         └─ Analytics: decisions, risk, drift
```

| Layer | Technology |
|---|---|
| Reasoning LLM | **Google Gemini** via `google-genai` (Vertex AI or Gemini API), function calling |
| Agent runtime | FastAPI, async tool orchestration, WebSocket + SSE streaming |
| Observability | **Arize AI** — OpenTelemetry / OpenInference export, drift + prompt-quality monitors |
| Agent Engine | Optional ADK packaging for **Vertex AI Agent Engine** (`agent_engine/`) |
| ML risk model | scikit-learn RandomForest (heuristic fallback) |
| Frontend | React + Vite + Tailwind, GSAP motion, sunset-based theming |
| Hosting | Docker → Cloud Run **or** any VPS behind nginx + Cloudflare (current demo) |

## 🔌 Arize integration (the partner track)

Arize is wired into **every reasoning step**, not just the final output
([`arize_integration/tracer.py`](arize_integration/tracer.py)):

- **Tracing** — `arize.otel.register(...)` sets up an OpenTelemetry tracer; we emit
  OpenInference spans (`TOOL`, `LLM`, `CHAIN`, `EVALUATOR`) for each tool call, the Gemini
  reasoning step, and the SAR draft. Queryable in the Arize platform and the Arize MCP server.
- **Model drift** — a PSI monitor compares the live risk-score distribution against a
  baseline; an alert fires (and surfaces on the dashboard) on a distribution shift.
- **Prompt quality** — each SAR draft is scored and flagged for human review if it regresses.
- **Human-in-the-loop** — analyst confirm/override is logged as an evaluation span
  (agent-vs-analyst agreement).

Set `ARIZE_API_KEY` + `ARIZE_SPACE_ID` to export to your space; leave blank to run fully
locally (spans mirrored in-memory and exposed at `GET /spans`).

## 🚀 Quick start (local)

```bash
# 1. Python deps
python -m venv .venv && . .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. Config
cp .env.example .env
#   Set GOOGLE_API_KEY (simplest) OR GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT.
#   Optionally set ARIZE_API_KEY + ARIZE_SPACE_ID, and DEMO_USERNAME / DEMO_PASSWORD.
#   With no keys at all, the agent uses a deterministic evidence heuristic so the
#   full pipeline still runs.

# 3. (optional) train the ML risk model
python scripts/train_model.py

# 4. Run the agent (http://localhost:8000)
python -m agent.orchestrator

# 5. Run the dashboard (separate terminal, http://localhost:5173)
cd dashboard && npm install && npm run dev

# 6. Fire test transactions from the CLI
python scripts/send_test_transaction.py --scenario fraud
python scripts/send_test_transaction.py --scenario drift --repeat 25   # trips the drift alert
```

Sign in with the demo account configured in your `.env`
(`DEMO_USERNAME` / `DEMO_PASSWORD`). For the hosted demo, the credentials are provided with
the submission.

## ⚙️ Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `GEMINI_MODEL` | e.g. `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-2.5-pro` |
| `GOOGLE_API_KEY` | Gemini Developer API key (simplest), **or** … |
| `GOOGLE_GENAI_USE_VERTEXAI` + `GOOGLE_CLOUD_PROJECT` | Vertex AI mode (keyless, for Cloud Run) |
| `ARIZE_API_KEY`, `ARIZE_SPACE_ID`, `ARIZE_MODEL_ID` | Live Arize tracing |
| `DEMO_USERNAME`, `DEMO_PASSWORD`, `AUTH_SECRET` | The single login account |
| `RL_MAX_PER_IP`, `RL_WINDOW_S`, `RL_GLOBAL_DAY` | Demo rate limits |

## 🛳️ Deploy

**Cloud Run (one service hosts API + console):**
```bash
PROJECT_ID=your-project ARIZE_API_KEY=... ARIZE_SPACE_ID=... ./scripts/deploy_cloud_run.sh
```

**Any Docker host / VPS (how the live demo runs):**
```bash
docker build -t fraudsentinel .
docker run -d --restart unless-stopped -p 127.0.0.1:8080:8080 --env-file .env fraudsentinel
# then reverse-proxy with nginx + TLS (see scripts/ and docs/)
```

**Vertex AI Agent Engine (ADK):** see [`agent_engine/README.md`](agent_engine/README.md).

## 🔗 API reference

All endpoints are mounted at both the root and under `/api/*`.

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/login` | — | Authenticate the demo account → session token |
| GET | `/health` | — | Health + demo mode + active model |
| GET | `/scenarios` | — | Demo scenarios |
| POST | `/investigate` | 🔒 | Run one investigation (sync) |
| POST | `/simulate` | 🔒 | Fire a batch (stress + drift demo) |
| POST | `/chat` | 🔒 | **SSE** stream of a payment-check digest |
| POST | `/feedback` | — | Analyst confirm/override → Arize eval span |
| GET | `/cases`, `/cases/{id}` | — | Case queue / detail |
| GET | `/metrics` | — | Aggregate analytics |
| GET | `/trace/{trace_id}` | — | Spans for one investigation (waterfall) |
| GET | `/drift-status`, `/spans` | — | Drift state / recent span log |
| WS | `/ws/{client_id}?token=…` | 🔒 | Real-time streaming investigations |

## ✅ Tests

```bash
pytest tests/ -v        # 43 tests: tools, orchestrator, endpoints, auth
```

## 🗂️ Repository layout

```
fraudsentinel/
├── agent/
│   ├── orchestrator.py        # FastAPI app, agentic pipeline, Gemini calls, auth, rate limits
│   ├── models.py              # Pydantic models
│   ├── tools/                 # risk_scorer · rule_engine · threat_feed · history_lookup · ip_classifier
│   └── prompts/               # investigation + SAR system prompts
├── agent_engine/              # ADK agent for Vertex AI Agent Engine + deploy script
├── arize_integration/tracer.py# OpenInference export, drift + quality monitors
├── data/mock_transactions.py
├── dashboard/                 # React + Vite + Tailwind console (GSAP, themes)
│   └── src/  App · views · ui · auth · theme · lib · icons
├── scripts/                   # send_test_transaction · train_model · deploy_cloud_run
├── tests/
├── Dockerfile                 # multi-stage: dashboard build + Python agent
└── requirements.txt
```

## 🏅 Hackathon compliance

- **Gemini on Google Cloud** for all reasoning (Vertex AI / `google-genai`); no competing AI.
- **Meaningful Arize integration** — OpenInference tracing at every step (verified exporting live).
- **Functional multi-step agent** with planning, tool use, action, and audit trail.
- **Runs on the web**, public repo, MIT licensed, hosted URL, ≤3-min demo
  ([`doc/DEMO_SCRIPT.md`](doc/DEMO_SCRIPT.md)), Devpost text ([`doc/DEVPOST.md`](doc/DEVPOST.md)).

## License

[MIT](LICENSE)

<div align="center"><sub>Built for the Google Cloud Rapid Agent Hackathon · Arize partner track</sub></div>
