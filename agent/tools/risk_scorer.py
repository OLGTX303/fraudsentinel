"""
Risk scorer tool — returns a 0-1 fraud probability using a trained RandomForest.
In DEMO_MODE, uses a rule-based heuristic so no model file is needed at first run.
Run `python scripts/train_model.py` to train the real ML model.
"""
from __future__ import annotations
import os
import numpy as np
from pathlib import Path
from agent.models import Transaction, RiskScore


MODEL_PATH = Path(__file__).parent.parent.parent / "data" / "risk_model.joblib"


def _feature_vector(tx: Transaction) -> np.ndarray:
    """Convert a transaction to a numeric feature vector."""
    return np.array([
        tx.amount,
        1.0 if tx.is_international else 0.0,
        1.0 if tx.card_country != tx.ip_country else 0.0,
        tx.hour_of_day,
        1.0 if tx.hour_of_day < 6 or tx.hour_of_day > 22 else 0.0,
        float(len(tx.ip_address.split(".")[-1])),  # crude IP entropy proxy
    ]).reshape(1, -1)


def _heuristic_score(tx: Transaction) -> float:
    """Fast rule-based fallback used in demo mode / before model training."""
    score = 0.0
    if tx.amount > 2000:
        score += 0.3
    if tx.is_international:
        score += 0.2
    if tx.card_country != tx.ip_country:
        score += 0.25
    if tx.hour_of_day < 5 or tx.hour_of_day > 23:
        score += 0.15
    if tx.amount > 5000:
        score += 0.1
    return min(score, 0.99)


def score_transaction(tx: Transaction) -> RiskScore:
    """
    Returns a RiskScore. Loads the joblib model if available,
    otherwise falls back to the heuristic scorer.
    """
    top_features: list[str] = []

    if MODEL_PATH.exists():
        try:
            import joblib
            model = joblib.load(MODEL_PATH)
            X = _feature_vector(tx)
            prob = float(model.predict_proba(X)[0][1])
            confidence = 0.85
            top_features = ["amount", "is_international", "country_mismatch",
                            "hour_of_day", "odd_hours"]
            return RiskScore(score=round(prob, 4), confidence=confidence,
                             top_features=top_features)
        except Exception:
            pass

    # Heuristic fallback
    score = _heuristic_score(tx)
    if tx.amount > 2000:
        top_features.append("high_amount")
    if tx.is_international:
        top_features.append("international_transaction")
    if tx.card_country != tx.ip_country:
        top_features.append("card_ip_country_mismatch")
    if tx.hour_of_day < 5:
        top_features.append("unusual_hour")

    return RiskScore(
        score=round(score, 4),
        confidence=0.72,
        top_features=top_features or ["no_strong_signals"],
    )
