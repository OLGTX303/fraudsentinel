"""
Mock transaction generator.
Provides four named demo scenarios and a random transaction factory.
"""
from __future__ import annotations
import random
import uuid
from datetime import datetime, timezone
from agent.models import Transaction

SCENARIOS: dict[str, dict] = {
    "clean": {
        "account_id": "ACC-NORMAL-001",
        "amount": 42.50,
        "currency": "USD",
        "merchant": "Blue Bottle Coffee",
        "merchant_category": "food_beverage",
        "card_country": "US",
        "ip_address": "104.18.12.101",
        "ip_country": "US",
        "device_id": "DEV-IPHONE-AA",
        "is_international": False,
        "hour_of_day": 9,
        "payment_method": "apple_pay",
    },
    "fraud": {
        "account_id": "ACC-FRAUD-001",
        "amount": 4200.00,
        "currency": "USD",
        "merchant": "ElectroMart Online",
        "merchant_category": "electronics",
        "card_country": "GB",
        "ip_address": "185.220.101.45",   # Known Tor/fraud ASN prefix
        "ip_country": "MD",               # Moldova
        "device_id": "DEV-UNKNOWN-ZZ",    # Never seen before
        "is_international": True,
        "hour_of_day": 3,
        "card_token": "4111111111111111",  # on the threat-feed blocklist
        "payment_method": "card",
    },
    "drift": {
        # Simulates a burst of high-risk transactions to trigger the drift monitor
        "account_id": "ACC-DRIFT-001",
        "amount": 1500.00,
        "currency": "USD",
        "merchant": "CryptoExchange Pro",
        "merchant_category": "financial_services",
        "card_country": "US",
        "ip_address": "91.108.56.100",    # Flagged ASN prefix
        "ip_country": "RU",
        "device_id": "DEV-ANDROID-YY",
        "is_international": True,
        "hour_of_day": 2,
        "payment_method": "google_pay",
    },
    "escalate": {
        # Ambiguous — high value but account has international history
        "account_id": "ACC-ESCALATE-001",
        "amount": 8500.00,
        "currency": "USD",
        "merchant": "Sotheby's Auction",
        "merchant_category": "luxury_goods",
        "card_country": "US",
        "ip_address": "98.139.180.149",   # Clean US IP (matches card country)
        "ip_country": "US",
        "device_id": "DEV-IPHONE-EE",
        "is_international": True,
        "hour_of_day": 14,
        "payment_method": "paypal",
    },
}


def make_transaction(scenario: str = "fraud") -> Transaction:
    """Build a Transaction from a named scenario."""
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}. Choose from: {list(SCENARIOS.keys())}")
    data = SCENARIOS[scenario].copy()
    data["transaction_id"] = f"TXN-{scenario.upper()}-{str(uuid.uuid4())[:8].upper()}"
    data["timestamp"] = datetime.now(timezone.utc)
    return Transaction(**data)


def make_random_transaction() -> Transaction:
    """Generate a randomised transaction (mix of clean and suspicious)."""
    is_fraud = random.random() < 0.25
    if is_fraud:
        scenario = random.choice(["fraud", "drift", "escalate"])
    else:
        scenario = "clean"
    tx = make_transaction(scenario)
    # Randomise amount slightly
    tx.amount = round(tx.amount * random.uniform(0.7, 1.4), 2)
    tx.transaction_id = f"TXN-RAND-{str(uuid.uuid4())[:8].upper()}"
    return tx
