"""
FraudSentinel as a Vertex AI **Agent Engine** (ADK) agent.

This is the "Google Agent Platform" packaging of the same agent that powers the
FastAPI app. It exposes the four investigation tools (plus the deeper related-
transaction lookup) to Gemini via Google's Agent Development Kit (ADK), so the
model plans its own tool use and returns a decision.

The tool functions reuse the SAME tested logic as the web app
(`agent/tools/*`), so there is one source of truth for the fraud rules.

Deploy with `agent_engine/deploy.py` (see agent_engine/README.md).
Run locally with:  adk run agent_engine   (after `pip install google-adk`)
"""
from __future__ import annotations

# Reuse the web app's tested tool logic + models.
from agent.models import Transaction
from agent.tools.history_lookup import get_account_history, get_related_transactions
from agent.tools.risk_scorer import score_transaction
from agent.tools.rule_engine import evaluate_rules
from agent.tools.threat_feed import check_threat_feeds

GEMINI_MODEL = "gemini-2.5-flash"


# ── ADK tools (plain typed functions + docstrings; ADK turns these into
#    Gemini function declarations automatically) ────────────────────────

def account_history(account_id: str, device_id: str) -> dict:
    """Retrieve the 90-day behavioural baseline for an account.

    Args:
        account_id: The account identifier, e.g. "ACC-FRAUD-001".
        device_id: The device fingerprint on this transaction.
    Returns:
        Average/max amounts, typical countries & hours, international %,
        and whether the device is new to the account.
    """
    return get_account_history(account_id, device_id).model_dump()


def risk_score(amount: float, is_international: bool, card_country: str,
               ip_country: str, hour_of_day: int, ip_address: str) -> dict:
    """Score a transaction's fraud probability (0-1) with the ML model.

    Returns the score, confidence, and the top contributing features.
    """
    tx = Transaction(account_id="_", amount=amount, merchant="_",
                     merchant_category="_", card_country=card_country,
                     ip_address=ip_address, ip_country=ip_country,
                     device_id="_", is_international=is_international,
                     hour_of_day=hour_of_day)
    return score_transaction(tx).model_dump()


def compliance_rules(account_id: str, device_id: str, amount: float,
                     card_country: str, ip_country: str, ip_address: str,
                     is_international: bool, hour_of_day: int) -> list[dict]:
    """Evaluate the transaction against compliance/AML policy rules.

    Returns every rule violation found (id, name, severity, description).
    """
    tx = Transaction(account_id=account_id, amount=amount, merchant="_",
                     merchant_category="_", card_country=card_country,
                     ip_address=ip_address, ip_country=ip_country,
                     device_id=device_id, is_international=is_international,
                     hour_of_day=hour_of_day)
    history = get_account_history(account_id, device_id)
    return [v.model_dump() for v in evaluate_rules(tx, history)]


def threat_feed(ip_address: str, card_country: str, ip_country: str,
                card_token: str = "0000") -> dict:
    """Check the IP and card against threat-intel blocklists.

    Returns whether the IP/card are flagged, the reasons, and an overall
    risk level.
    """
    tx = Transaction(account_id="_", amount=0.0, merchant="_",
                     merchant_category="_", card_country=card_country,
                     ip_address=ip_address, ip_country=ip_country,
                     device_id="_", card_token=card_token)
    return check_threat_feeds(tx, card_token).model_dump()


def related_transactions(account_id: str) -> dict:
    """Deeper lookup: the account's recent 24h activity (volume, distinct
    merchants, total spend, rapid-succession flag). Call this when the
    evidence is ambiguous and recent behaviour would change the decision."""
    return get_related_transactions(account_id)


INSTRUCTION = """You are FraudSentinel, an autonomous financial-fraud investigator.

For each transaction you are given, investigate by calling the tools:
1. account_history  — the account's normal behaviour
2. risk_score       — the ML fraud probability
3. compliance_rules — policy/AML violations
4. threat_feed      — IP/card blocklist hits
If the evidence is ambiguous, also call related_transactions for recent activity.

Then decide ONE of: ALLOW, FLAG, BLOCK, using this rubric:
- BLOCK  — risk_score > 0.7, OR any HIGH/CRITICAL violation, OR any threat hit
- ALLOW  — risk_score < 0.4 AND fewer than 2 violations AND no threat hit
- FLAG   — anything in between / genuinely ambiguous

Respond with the decision, a 3-6 sentence plain-English justification that cites
the specific evidence, and 3-5 key signals. Be direct and factual."""


# ADK looks for a module-level `root_agent`.
try:
    from google.adk.agents import Agent

    root_agent = Agent(
        name="fraudsentinel",
        model=GEMINI_MODEL,
        description="Autonomous fraud investigation agent (Gemini + Arize).",
        instruction=INSTRUCTION,
        tools=[account_history, risk_score, compliance_rules, threat_feed, related_transactions],
    )
except ImportError:  # google-adk not installed in this environment
    root_agent = None
