"""
History lookup tool — retrieves 90-day account behaviour baseline.
In DEMO_MODE uses an in-memory mock store.
In production, swap _query_mock for a BigQuery or Postgres query.
"""
from __future__ import annotations
import os
import random
from agent.models import AccountHistory

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

# ── Mock account profiles ─────────────────────────────────────────
_ACCOUNTS: dict[str, dict] = {
    "ACC-NORMAL-001": {
        "avg_transaction_amount": 85.0,
        "max_transaction_amount": 420.0,
        "typical_countries": ["US"],
        "typical_hours": list(range(8, 22)),
        "transaction_count_90d": 47,
        "international_pct": 0.0,
    },
    "ACC-FRAUD-001": {
        "avg_transaction_amount": 85.0,
        "max_transaction_amount": 420.0,
        "typical_countries": ["GB"],
        "typical_hours": list(range(9, 21)),
        "transaction_count_90d": 52,
        "international_pct": 0.02,
    },
    "ACC-DRIFT-001": {
        "avg_transaction_amount": 200.0,
        "max_transaction_amount": 800.0,
        "typical_countries": ["US", "CA"],
        "typical_hours": list(range(7, 23)),
        "transaction_count_90d": 120,
        "international_pct": 0.15,
    },
    "ACC-ESCALATE-001": {
        "avg_transaction_amount": 500.0,
        "max_transaction_amount": 5000.0,
        "typical_countries": ["US", "GB", "DE"],
        "typical_hours": list(range(6, 23)),
        "transaction_count_90d": 200,
        "international_pct": 0.40,
    },
}

_DEFAULT_PROFILE = {
    "avg_transaction_amount": 100.0,
    "max_transaction_amount": 500.0,
    "typical_countries": ["US"],
    "typical_hours": list(range(8, 22)),
    "transaction_count_90d": 30,
    "international_pct": 0.05,
}


def _query_mock(account_id: str, device_id: str) -> dict:
    profile = _ACCOUNTS.get(account_id, _DEFAULT_PROFILE).copy()
    # Simulate new device detection
    known_devices = {
        "ACC-NORMAL-001":   ["DEV-IPHONE-AA"],
        "ACC-FRAUD-001":    ["DEV-ANDROID-BB"],
        "ACC-DRIFT-001":    ["DEV-IPHONE-CC", "DEV-MACBOOK-DD"],
        "ACC-ESCALATE-001": ["DEV-IPHONE-EE", "DEV-IPAD-FF"],
    }
    known = known_devices.get(account_id, [])
    profile["new_device"] = device_id not in known
    return profile


def get_related_transactions(account_id: str) -> dict:
    """
    Deeper lookup the agent can choose to call: recent activity on the same
    account in the last 24h. In production this is a BigQuery window query;
    in DEMO_MODE it is derived deterministically from the account id so the
    agent's extra investigative step is reproducible.
    """
    seed = sum(ord(c) for c in account_id)
    flagged = "FRAUD" in account_id or "DRIFT" in account_id
    count_24h = (seed % 4) + (6 if flagged else 1)
    distinct_merchants = (seed % 3) + (5 if flagged else 1)
    total_amount = round((count_24h * (1800 if flagged else 60)) * 1.0, 2)
    return {
        "account_id": account_id,
        "transactions_24h": count_24h,
        "distinct_merchants_24h": distinct_merchants,
        "total_amount_24h": total_amount,
        "rapid_succession": flagged and count_24h >= 5,
        "note": (
            "Multiple high-value charges across unrelated merchants in a short "
            "window — consistent with card-testing / bust-out fraud."
            if flagged else
            "Activity volume and merchant spread are within normal range."
        ),
    }


def get_account_history(account_id: str, device_id: str) -> AccountHistory:
    """
    Returns an AccountHistory for the given account.
    In production, replace _query_mock with:
        from google.cloud import bigquery
        client = bigquery.Client()
        row = client.query(SQL, ...).result()
    """
    if DEMO_MODE:
        data = _query_mock(account_id, device_id)
    else:
        # Production stub
        data = _DEFAULT_PROFILE.copy()
        data["new_device"] = True

    return AccountHistory(
        account_id=account_id,
        **data,
    )
