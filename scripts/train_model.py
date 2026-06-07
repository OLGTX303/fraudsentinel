#!/usr/bin/env python
"""
Trains a RandomForest fraud risk scorer on synthetic data and saves it to
data/risk_model.joblib. Run this once before starting the server for
higher-quality ML-based scoring (vs the heuristic fallback).

Usage:
  python scripts/train_model.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from rich.console import Console

console = Console()
MODEL_PATH = Path(__file__).parent.parent / "data" / "risk_model.joblib"


def generate_synthetic_data(n: int = 5000):
    """
    Generate a labelled synthetic dataset of transactions.
    Features: [amount, is_international, country_mismatch, hour, odd_hour, ip_entropy]
    Label: 1 = fraud, 0 = clean
    """
    rng = np.random.default_rng(42)
    X, y = [], []

    for _ in range(n):
        is_fraud = rng.random() < 0.25

        if is_fraud:
            amount          = rng.exponential(3000)
            is_intl         = float(rng.random() < 0.8)
            country_mismatch = float(rng.random() < 0.75)
            hour            = float(rng.integers(0, 6) if rng.random() < 0.6 else rng.integers(0, 24))
            odd_hour        = float(hour < 6 or hour > 22)
            ip_entropy      = float(rng.integers(3, 10))
        else:
            amount          = rng.exponential(150)
            is_intl         = float(rng.random() < 0.1)
            country_mismatch = float(rng.random() < 0.05)
            hour            = float(rng.integers(8, 22))
            odd_hour        = 0.0
            ip_entropy      = float(rng.integers(1, 5))

        X.append([amount, is_intl, country_mismatch, hour, odd_hour, ip_entropy])
        y.append(1 if is_fraud else 0)

    return np.array(X), np.array(y)


def main():
    console.print("[bold blue]Training FraudSentinel risk scorer...[/bold blue]")

    X, y = generate_synthetic_data(5000)
    console.print(f"  Generated {len(X)} samples ({y.sum()} fraud, {(1-y).sum()} clean)")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    report = classification_report(y_test, model.predict(X_test))
    console.print("\n[bold]Evaluation on test set:[/bold]")
    console.print(report)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    console.print(f"\n[green]✓ Model saved to {MODEL_PATH}[/green]")
    console.print("  Restart the agent server to use the new model.")


if __name__ == "__main__":
    main()
