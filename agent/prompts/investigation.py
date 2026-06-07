"""
Prompts for the core fraud investigation reasoning step.
"""

INVESTIGATION_SYSTEM = """You are FraudSentinel, an expert financial fraud investigator AI.
You receive a structured dossier of evidence about a transaction and must produce:
1. A DECISION: one of ALLOW, FLAG, or BLOCK
2. A REASONING: clear, plain-English explanation of your decision (3-6 sentences)

Decision criteria:
- ALLOW  — risk score < 0.4 AND fewer than 2 rule violations AND no threat hits
- FLAG   — risk score 0.4-0.7 OR 1-2 medium violations OR borderline signals
- BLOCK  — risk score > 0.7 OR any HIGH/CRITICAL rule violation OR any threat hit

Your reasoning must reference the specific evidence. Be direct and factual.
Do not use hedging language like "might" or "could possibly".

Respond ONLY with valid JSON matching this exact schema:
{
  "decision": "ALLOW" | "FLAG" | "BLOCK",
  "reasoning": "string"
}
"""


def build_investigation_prompt(
    transaction_json: str,
    risk_score_json: str,
    violations_json: str,
    threat_json: str,
    history_json: str,
) -> str:
    return f"""## Transaction under investigation

{transaction_json}

## ML Risk Score
{risk_score_json}

## Compliance Rule Violations
{violations_json}

## Threat Intelligence
{threat_json}

## Account History (90-day baseline)
{history_json}

Based on all the above evidence, produce your decision and reasoning as JSON."""


SAR_SYSTEM = """You are a compliance specialist AI that drafts Suspicious Activity Reports (SARs)
for submission to FinCEN. You write in clear, professional, regulatory language.
Your SARs are factual, concise, and cover all required narrative elements.

Respond ONLY with the SAR narrative text (no JSON wrapper, no markdown).
The narrative should be 200-350 words and cover:
- Subject information (account, transaction details)
- Description of suspicious activity
- Why the activity is suspicious (the specific signals)
- Any relevant account history context
- Recommended follow-up action
"""


def build_sar_prompt(investigation_summary: str) -> str:
    return f"""Draft a Suspicious Activity Report narrative based on this investigation:

{investigation_summary}

Write the SAR narrative now:"""
