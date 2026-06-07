# FraudSentinel — Devpost submission

**Tagline:** A Gemini-powered agent that investigates suspicious transactions like a human
fraud analyst — and exports every reasoning step to Arize for full auditability.

**Partner track:** Arize
**Challenge area:** Financial services
**Hosted URL:** `<your Cloud Run URL>`
**Repository:** `<your public GitHub URL>` (MIT licensed)
**Demo video:** `<your ~3-min YouTube/Vimeo URL>`

---

## Inspiration
Fraud teams are drowning. Rule engines fire thousands of low-context alerts a day, and a
human still has to open ten tabs — history, geolocation, device, threat feeds — to decide
if a transaction is fraud, then hand-write a Suspicious Activity Report. We wanted an
*agent* that does the whole investigation autonomously, explains itself in plain English,
and is fully observable so a compliance team can trust and audit it.

## What it does
When a transaction arrives, FraudSentinel:
1. Gathers evidence with four tools (account history, ML risk scorer, compliance rule
   engine, live threat-feed lookup).
2. Reasons **agentically** — Gemini function-calling decides whether it needs a deeper
   `lookup_related_transactions` check before committing, then returns
   **ALLOW / FLAG / BLOCK** with key signals and a plain-English justification.
3. On a BLOCK, autonomously drafts a FinCEN-style SAR narrative.
4. Streams the whole investigation live to a 4-view analyst console (Console, Cases,
   Trace, Analytics), and exports every step to **Arize** as an OpenInference trace —
   with model-drift and SAR prompt-quality monitoring on top.
5. Lets a human **confirm or override** each decision; that feedback is logged to Arize as
   an agreement label, closing the loop.

All in under two seconds per transaction.

## How we built it
- **Google Gemini** via the `google-genai` SDK, running on **Vertex AI** (Cloud Run uses
  Application Default Credentials — no key in the container) with a Gemini-API-key fallback
  for local dev. The agent uses **Gemini function calling** to plan its own tool use.
- **FastAPI** orchestrates the async tool pipeline and streams updates over WebSocket.
- **Arize AI** is the observability backbone: `arize.otel.register()` sets up an
  OpenTelemetry tracer and we emit OpenInference spans (`TOOL`, `LLM`, `CHAIN`,
  `EVALUATOR`) for every step, plus a PSI-based drift monitor and SAR quality evals.
- **scikit-learn** RandomForest for the risk score (heuristic fallback when untrained).
- **React + Vite + Tailwind** dashboard, bundled into the Python image by a multi-stage
  Dockerfile and served by the same Cloud Run service.

## Data sources
Demo transactions are synthetic (`data/mock_transactions.py`) — four realistic scenarios
(clean, fraud, drift, escalation) plus a random generator — so judges can reproduce every
outcome without sensitive financial data. The tools (threat feeds, account history) are
mock services with the same interfaces real providers expose, so swapping in live data is a
drop-in change.

## Challenges we ran into
- Designing spans so an Arize trace reads like a real investigation tree (chain → tools →
  LLM → evaluator) rather than a flat log.
- Making the agent degrade gracefully: it runs end-to-end with no Gemini key, no Arize key,
  and no trained model, which kept the demo reliable.
- Keeping the WebSocket stream and the final REST result perfectly consistent.

## Accomplishments we're proud of
- Arize is integrated at *every* reasoning step, not bolted onto the final output.
- A genuinely useful, regulator-aware output (the SAR draft), not just a label.
- One container, one URL: API + live dashboard on Cloud Run.

## What we learned
- OpenInference span kinds make agent traces dramatically more legible in Arize.
- Vertex AI + ADC is the cleanest auth story for an agent on Cloud Run.
- Drift monitoring on the *score distribution* is an early-warning signal for new fraud
  patterns that individual alerts miss.

## What's next
- Replace mock tools with live threat-intel and core-banking APIs.
- Human-in-the-loop SAR approval workflow with Arize-tracked feedback.
- Use Arize evals to continuously fine-tune the reasoning prompt.

## Built with
google-gemini · vertex-ai · google-cloud-run · arize · opentelemetry · openinference ·
fastapi · python · scikit-learn · react · vite · tailwindcss · gsap · websockets
