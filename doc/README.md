# FraudSentinel

**Real-Time Fraud Investigation Agent powered by Gemini + Arize AI**

> Google Cloud Rapid Agent Hackathon — Arize Track submission

---

## What it does

FraudSentinel is an autonomous fraud investigation agent that goes beyond traditional rule-based scoring. When a suspicious transaction fires, the agent:

1. **Investigates** — autonomously gathers device fingerprints, account history, geolocation anomalies, and live threat-feed data
2. **Reasons** — uses Gemini to synthesise all signals and produce a confidence-weighted decision with a plain-English explanation
3. **Acts** — blocks or flags the transaction instantly, then generates a regulator-ready Suspicious Activity Report (SAR) draft
4. **Observes** — every step is traced, monitored, and surfaced via Arize AI, providing full audit trails and drift alerts

All of this happens in under 2 seconds.

---

## Architecture

```
Transaction stream ──┐
User behaviour       ├──► Google Cloud Agent Builder
Historical DB        │         │
Threat feeds ────────┘         ▼
                         Gemini reasoning core
                         ├── Risk scorer tool
                         └── Compliance rule engine tool
                                    │
                              Arize AI (MCP)
                         ├── Trace & span logs
                         ├── Drift detection
                         └── Prompt monitoring
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Block/flag      Case report       SAR draft
```

---

## Arize MCP integration

The Arize integration is the centrepiece of the observability layer. Every agent action is wrapped in an Arize trace:

- **Span logging** — tool calls, scoring steps, and LLM completions each produce a labelled span with latency, inputs, and outputs
- **Prompt monitoring** — SAR draft quality is continuously monitored for regression and hallucination risk
- **Model drift detection** — alerts fire when the fraud score distribution shifts, indicating a new attack pattern
- **Audit trail** — every decision is stored with full explainability metadata, satisfying AML/KYC compliance requirements

---

## Quick start

### Prerequisites

- Python 3.11+
- Google Cloud account with Agent Builder enabled
- Arize AI account (free tier works)
- Node.js 18+ (for the dashboard)

### Installation

```bash
git clone https://github.com/your-username/fraudsentinel
cd fraudsentinel
pip install -r requirements.txt
cp .env.example .env
# Fill in your API keys in .env
```

### Environment variables

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
ARIZE_API_KEY=your-arize-api-key
ARIZE_SPACE_ID=your-arize-space-id
ARIZE_MODEL_ID=fraudsentinel-v1
GEMINI_MODEL=gemini-2.0-flash
```

### Run the agent

```bash
# Start the agent server
python -m agent.orchestrator

# In a separate terminal, start the dashboard
cd dashboard && npm install && npm run dev

# Send a test transaction
python scripts/send_test_transaction.py --scenario fraud
```

---

## Project structure

```
fraudsentinel/
├── agent/
│   ├── tools/
│   │   ├── risk_scorer.py        # ML-based confidence scoring
│   │   ├── rule_engine.py        # Compliance policy rules
│   │   ├── threat_feed.py        # IP/card blocklist APIs
│   │   └── history_lookup.py     # Historical pattern retrieval
│   ├── prompts/
│   │   ├── investigation.py      # Main investigation prompt
│   │   └── sar_draft.py          # SAR generation prompt
│   └── orchestrator.py           # Agent Builder orchestration
├── arize_integration/
│   ├── tracer.py                 # Arize MCP span instrumentation
│   └── monitors.py               # Drift + prompt quality monitors
├── data/
│   ├── mock_transactions.py      # Simulated transaction generator
│   └── fraud_patterns.json       # Sample fraud pattern library
├── dashboard/                    # React + Vite analyst UI
├── scripts/
│   └── send_test_transaction.py
├── requirements.txt
├── .env.example
└── README.md
```

---

## Demo scenarios

| Scenario | Description | Expected outcome |
|---|---|---|
| `clean` | Normal domestic payment | Allow, low risk score |
| `fraud` | Cross-border card, new device, 3am | Block, SAR drafted |
| `drift` | Burst of novel attack patterns | Arize drift alert fires |
| `escalate` | Ambiguous high-value transaction | Flag for human review |

---

## Licence

MIT — see [LICENSE](LICENSE)
