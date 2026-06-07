"""
Unit tests for FraudSentinel agent tools.
Run with: pytest tests/ -v
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, timezone
from agent.models import Transaction, AccountHistory
from agent.tools.risk_scorer import score_transaction
from agent.tools.rule_engine import evaluate_rules
from agent.tools.threat_feed import check_threat_feeds
from agent.tools.history_lookup import get_account_history, get_related_transactions
from data.mock_transactions import make_transaction, SCENARIOS


# ── Fixtures ─────────────────────────────────────────────────────

def clean_tx() -> Transaction:
    return make_transaction("clean")

def fraud_tx() -> Transaction:
    return make_transaction("fraud")

def clean_history() -> AccountHistory:
    return get_account_history("ACC-NORMAL-001", "DEV-IPHONE-AA")

def fraud_history() -> AccountHistory:
    return get_account_history("ACC-FRAUD-001", "DEV-UNKNOWN-ZZ")


# ── Risk scorer tests ─────────────────────────────────────────────

class TestRiskScorer:
    def test_clean_transaction_scores_low(self):
        score = score_transaction(clean_tx())
        assert score.score < 0.5, f"Clean tx should score < 0.5, got {score.score}"

    def test_fraud_transaction_scores_high(self):
        score = score_transaction(fraud_tx())
        assert score.score >= 0.5, f"Fraud tx should score >= 0.5, got {score.score}"

    def test_score_in_range(self):
        for scenario in SCENARIOS:
            tx = make_transaction(scenario)
            score = score_transaction(tx)
            assert 0.0 <= score.score <= 1.0, f"Score out of range: {score.score}"
            assert 0.0 <= score.confidence <= 1.0

    def test_top_features_returned(self):
        score = score_transaction(fraud_tx())
        assert isinstance(score.top_features, list)
        assert len(score.top_features) > 0


# ── Rule engine tests ─────────────────────────────────────────────

class TestRuleEngine:
    def test_clean_transaction_no_violations(self):
        violations = evaluate_rules(clean_tx(), clean_history())
        assert len(violations) == 0, f"Expected 0 violations, got {len(violations)}"

    def test_fraud_transaction_has_violations(self):
        violations = evaluate_rules(fraud_tx(), fraud_history(), recent_tx_count=3)
        assert len(violations) > 0

    def test_country_mismatch_flagged(self):
        tx = fraud_tx()
        assert tx.card_country != tx.ip_country
        violations = evaluate_rules(tx, fraud_history())
        rule_ids = [v.rule_id for v in violations]
        assert "GEO-002" in rule_ids

    def test_velocity_rule_triggers(self):
        violations = evaluate_rules(clean_tx(), clean_history(), recent_tx_count=5)
        rule_ids = [v.rule_id for v in violations]
        assert "VEL-001" in rule_ids

    def test_ctr_threshold(self):
        tx = clean_tx()
        tx.amount = 15_000.00
        violations = evaluate_rules(tx, clean_history())
        rule_ids = [v.rule_id for v in violations]
        assert "CTR-001" in rule_ids

    def test_violation_severity_types(self):
        tx = fraud_tx()
        violations = evaluate_rules(tx, fraud_history(), recent_tx_count=3)
        for v in violations:
            assert v.severity in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


# ── Threat feed tests ─────────────────────────────────────────────

class TestThreatFeed:
    def test_clean_ip_not_flagged(self):
        tx = clean_tx()
        result = check_threat_feeds(tx)
        assert not result.ip_flagged

    def test_fraud_ip_flagged(self):
        tx = fraud_tx()
        result = check_threat_feeds(tx)
        assert result.ip_flagged
        assert result.risk_level in ("HIGH", "MEDIUM")

    def test_risk_level_valid(self):
        for scenario in SCENARIOS:
            tx = make_transaction(scenario)
            result = check_threat_feeds(tx)
            assert result.risk_level in ("NONE", "LOW", "MEDIUM", "HIGH")


# ── History lookup tests ──────────────────────────────────────────

class TestHistoryLookup:
    def test_known_account_returns_history(self):
        hist = get_account_history("ACC-NORMAL-001", "DEV-IPHONE-AA")
        assert hist.account_id == "ACC-NORMAL-001"
        assert hist.avg_transaction_amount > 0

    def test_known_device_not_new(self):
        hist = get_account_history("ACC-NORMAL-001", "DEV-IPHONE-AA")
        assert not hist.new_device

    def test_unknown_device_is_new(self):
        hist = get_account_history("ACC-FRAUD-001", "DEV-UNKNOWN-ZZ")
        assert hist.new_device

    def test_unknown_account_returns_default(self):
        hist = get_account_history("ACC-DOES-NOT-EXIST", "DEV-XYZ")
        assert hist.avg_transaction_amount > 0


class TestRelatedTransactions:
    """The deeper lookup the agent can choose to call during reasoning."""
    def test_shape_and_determinism(self):
        a = get_related_transactions("ACC-NORMAL-001")
        b = get_related_transactions("ACC-NORMAL-001")
        for key in ("transactions_24h", "distinct_merchants_24h",
                    "total_amount_24h", "rapid_succession", "note"):
            assert key in a
        assert a == b  # deterministic in demo mode

    def test_fraud_account_flagged_pattern(self):
        r = get_related_transactions("ACC-FRAUD-001")
        assert r["rapid_succession"] is True
        assert r["transactions_24h"] >= 5


# ── Mock transaction tests ────────────────────────────────────────

class TestMockTransactions:
    def test_all_scenarios_build(self):
        for scenario in SCENARIOS:
            tx = make_transaction(scenario)
            assert tx.transaction_id
            assert tx.amount > 0

    def test_fraud_scenario_is_international(self):
        tx = make_transaction("fraud")
        assert tx.is_international

    def test_clean_scenario_is_domestic(self):
        tx = make_transaction("clean")
        assert not tx.is_international
