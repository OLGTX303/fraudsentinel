"""
Threat feed tool — checks IP addresses and card hashes against
blocklists. In DEMO_MODE uses a local mock database so no external
API keys are required.
"""
from __future__ import annotations
import os
import hashlib
from agent.models import Transaction, ThreatHit

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

# ── Mock threat intelligence database ────────────────────────────
_FLAGGED_IP_PREFIXES = {
    "185.220": ("HIGH",  "Known Tor exit node / fraud ring ASN"),
    "91.108":  ("HIGH",  "Associated with credential stuffing campaigns"),
    "45.142":  ("MEDIUM","Bulletproof hosting provider"),
    "10.0.0":  ("NONE",  None),   # private range — always clean in demo
}

_FLAGGED_CARD_HASHES: dict[str, tuple[str, str]] = {
    # SHA-256 of "4111111111111111" (the test card used in the fraud scenario).
    "9bbef19476623ca56c17da75fd57734dbf82530686043a6e491c6d71befe8f6e": (
        "HIGH", "Card number associated with 3 prior chargebacks"
    ),
}


def _hash_card(card_last4: str) -> str:
    return hashlib.sha256(card_last4.encode()).hexdigest()


def _check_ip_mock(ip: str) -> tuple[bool, str | None, str]:
    prefix2 = ".".join(ip.split(".")[:2])
    if prefix2 in _FLAGGED_IP_PREFIXES:
        level, reason = _FLAGGED_IP_PREFIXES[prefix2]
        flagged = level != "NONE"
        return flagged, reason if flagged else None, level
    return False, None, "NONE"


def _check_card_mock(card_last4: str) -> tuple[bool, str | None]:
    h = _hash_card(card_last4)
    if h in _FLAGGED_CARD_HASHES:
        _, reason = _FLAGGED_CARD_HASHES[h]
        return True, reason
    return False, None


def check_threat_feeds(tx: Transaction, card_last4: str = "0000") -> ThreatHit:
    """
    In DEMO_MODE: uses local mock data.
    In production: replace _check_ip_mock / _check_card_mock with
    real API calls to IPQS, FraudGuard, or similar.
    """
    if DEMO_MODE:
        ip_flagged, ip_reason, ip_risk = _check_ip_mock(tx.ip_address)
        card_flagged, card_reason = _check_card_mock(card_last4)
    else:
        # Production stub — wire up real API here
        ip_flagged, ip_reason, ip_risk = False, None, "NONE"
        card_flagged, card_reason = False, None

    overall_risk = "NONE"
    if ip_flagged or card_flagged:
        overall_risk = "HIGH" if (ip_flagged and card_flagged) else ip_risk if ip_flagged else "MEDIUM"

    return ThreatHit(
        ip_flagged=ip_flagged,
        card_flagged=card_flagged,
        ip_reason=ip_reason,
        card_reason=card_reason,
        risk_level=overall_risk,
    )
