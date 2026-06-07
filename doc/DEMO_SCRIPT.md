# FraudSentinel — 3-minute demo script

Target length **2:50**. Record at 1080p+. Have the agent running and the dashboard open at
the Cloud Run URL. Pre-warm by running one `clean` investigation before recording so the
WebSocket is connected.

| Time | On screen | Say (voiceover) |
|------|-----------|-----------------|
| 0:00–0:18 | **Console** view, sidebar + status bar | "Fraud teams get thousands of low-context alerts a day. FraudSentinel is an autonomous agent that investigates each suspicious transaction like a human analyst would — powered by Gemini on Google Cloud, fully observable with Arize." |
| 0:18–0:32 | Click **Clean payment** → Run | "A normal $42 coffee purchase: the agent runs its tools, Gemini reasons, and returns ALLOW instantly. No friction for the customer." |
| 0:32–1:15 | Click **Fraud attempt** → Run; let the live agent trace stream | "Now a $4,200 charge — a UK card, IP in Moldova, unseen device, 3 a.m. Watch the agent work: account history, ML risk score, compliance rules, threat feeds — and because it's agentic, Gemini chooses to run a deeper related-transaction lookup before committing to **BLOCK**. The decision card shows the risk meter, key signals, and the exact reasoning." |
| 1:15–1:35 | Scroll the decision card to the SAR draft | "On a block it autonomously drafts a FinCEN-style Suspicious Activity Report — the tedious paperwork done in seconds, ready for compliance review." |
| 1:35–1:55 | Click **Confirm / Override**, then go to **Cases** | "An analyst can confirm or override the call — that feedback is logged to Arize as an agreement label, so the agent's accuracy is tracked over time. Every investigation lands in a reviewable case queue." |
| 1:55–2:20 | **Trace** view, then app.arize.com | "Open the trace: every tool call, the Gemini reasoning, the SAR draft — exported to Arize as OpenInference spans. The whole decision is auditable end to end, which is non-negotiable in financial services." |
| 2:20–2:38 | **Console** → **Simulate 25**, watch drift alert; then **Analytics** | "A burst of novel attack patterns trips Arize's drift monitor, and Analytics shows the decision mix, risk distribution, latency and drift at a glance." |
| 2:38–2:50 | Architecture slide / repo | "Gemini for agentic reasoning, Arize for observability, one Cloud Run service for the agent and console. That's FraudSentinel." |

## Recording checklist
- [ ] English audio or burned-in subtitles (required).
- [ ] Show the live Cloud Run URL in the browser bar at least once.
- [ ] Show a real Arize trace (use a configured ARIZE_API_KEY/SPACE_ID for the recording).
- [ ] Keep total length under 3:00.
- [ ] Upload as public/unlisted YouTube or Vimeo; paste the link into Devpost.
