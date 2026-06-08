"""
Card BIN (Bank Identification Number) pre-check.

Given the first 6-8 digits of a card, derive the scheme/brand, funding type
(credit/debit/prepaid), and issuing country, then surface fraud signals:
  - high-risk BIN (card-testing / fraud-ring ranges)
  - BIN issuer country vs the declared card country mismatch
  - prepaid funding (elevated chargeback / money-laundering risk)

In DEMO_MODE this is deterministic from the BIN. In production, swap `bin_check`
for a real BIN database / API (e.g. Binlist, IINlist, or your processor's BIN file).
"""
from __future__ import annotations

_HIGH_RISK_BINS = {"411111", "424242", "400000"}  # classic test / abused BINs

# Mock issuer-country by leading digits (first 4).
_ISSUER_COUNTRY = {
    "4111": "US", "4242": "US", "4000": "US",
    "5555": "US", "5105": "US",
    "3400": "US", "3700": "US",
    "6200": "CN", "6011": "US", "6500": "US",
    "3528": "JP",
}


def detect_brand(digits: str) -> str:
    n = digits
    if not n:
        return "unknown"
    if n[0] == "4":
        return "visa"
    if n[:2] in ("34", "37"):
        return "amex"
    if n[:2] in ("51", "52", "53", "54", "55") or (2221 <= int(n[:4] or 0) <= 2720):
        return "mastercard"
    if n[:2] == "62":
        return "unionpay"
    if n[:4] == "6011" or n[:2] == "65" or n[:3] in ("644", "645", "646", "647", "648", "649"):
        return "discover"
    if n[:2] == "35":
        return "jcb"
    if n[:2] in ("36", "38", "39") or n[:3] in ("300", "301", "302", "303", "304", "305"):
        return "diners"
    return "unknown"


def bin_check(card_token: str, declared_country: str = "US") -> dict:
    digits = "".join(c for c in (card_token or "") if c.isdigit())
    if len(digits) < 6 or digits == "000000" or set(digits) == {"0"}:
        # Wallet / tokenised payment — no raw BIN to inspect.
        return {"available": False, "note": "Tokenised payment — no raw BIN to inspect."}

    bin6 = digits[:6]
    brand = detect_brand(digits)
    seed = sum(ord(c) for c in bin6)
    funding = ("prepaid", "debit", "credit")[seed % 3]
    if brand == "amex":
        funding = "credit"
    issuer_country = _ISSUER_COUNTRY.get(digits[:4], ("US", "GB", "CN", "DE", "BR")[seed % 5])
    high_risk = bin6 in _HIGH_RISK_BINS
    country_mismatch = issuer_country != (declared_country or "US")
    return {
        "available": True,
        "bin": bin6,
        "brand": brand,
        "funding": funding,
        "prepaid": funding == "prepaid",
        "issuer_country": issuer_country,
        "declared_country": declared_country,
        "country_mismatch": country_mismatch,
        "high_risk": high_risk,
        "note": (
            f"{brand.upper()} {funding} card issued in {issuer_country}"
            + (" · BIN on high-risk list" if high_risk else "")
            + (f" · issuer/declared country mismatch ({issuer_country}≠{declared_country})" if country_mismatch else "")
        ),
    }


def bin_violations(info: dict) -> list[dict]:
    """Turn BIN signals into rule-violation dicts (merged by the orchestrator)."""
    if not info.get("available"):
        return []
    v = []
    if info.get("high_risk"):
        v.append({"rule_id": "BIN-001", "rule_name": "High-risk card BIN",
                  "severity": "HIGH",
                  "description": f"BIN {info['bin']} is on the card-testing / fraud-ring list."})
    if info.get("country_mismatch"):
        v.append({"rule_id": "BIN-002", "rule_name": "BIN issuer / card country mismatch",
                  "severity": "HIGH",
                  "description": (f"Card BIN was issued in {info['issuer_country']} but the "
                                  f"transaction declares {info['declared_country']}.")})
    if info.get("prepaid"):
        v.append({"rule_id": "BIN-003", "rule_name": "Prepaid card",
                  "severity": "MEDIUM",
                  "description": "Prepaid funding — elevated chargeback and laundering risk."})
    return v
