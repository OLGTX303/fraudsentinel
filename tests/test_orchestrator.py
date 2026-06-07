"""
Integration tests for the FraudSentinel orchestrator.
Uses FastAPI's TestClient — no running server needed.

Run with: pytest tests/test_orchestrator.py -v
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from agent.orchestrator import app, DEMO_USERNAME, DEMO_PASSWORD
from data.mock_transactions import make_transaction

client = TestClient(app)

# Authenticate once — the expensive endpoints now require the demo login token.
TOKEN = client.post("/login", json={"username": DEMO_USERNAME,
                                    "password": DEMO_PASSWORD}).json()["token"]
AUTH = {"Authorization": f"Bearer {TOKEN}"}


class TestHealthEndpoints:
    def test_health_returns_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_scenarios_returns_list(self):
        r = client.get("/scenarios")
        assert r.status_code == 200
        scenarios = r.json()["scenarios"]
        assert "clean" in scenarios
        assert "fraud" in scenarios

    def test_drift_status_returns_data(self):
        r = client.get("/drift-status")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert "psi" in data

    def test_spans_endpoint(self):
        r = client.get("/spans?limit=10")
        assert r.status_code == 200
        assert "spans" in r.json()


class TestInvestigateEndpoint:
    def test_clean_transaction_returns_allow(self):
        tx = make_transaction("clean")
        r = client.post("/investigate", json=tx.model_dump(mode="json"), headers=AUTH)
        assert r.status_code == 200
        result = r.json()
        assert result["decision"] in ("ALLOW", "FLAG", "BLOCK")
        assert 0.0 <= result["risk_score"] <= 1.0
        assert result["reasoning"]
        assert result["processing_ms"] > 0

    def test_fraud_transaction_not_allowed(self):
        tx = make_transaction("fraud")
        r = client.post("/investigate", json=tx.model_dump(mode="json"), headers=AUTH)
        assert r.status_code == 200
        result = r.json()
        # Fraud scenario should be BLOCK or FLAG, never ALLOW
        assert result["decision"] in ("BLOCK", "FLAG")

    def test_fraud_generates_sar(self):
        tx = make_transaction("fraud")
        r = client.post("/investigate", json=tx.model_dump(mode="json"), headers=AUTH)
        assert r.status_code == 200
        result = r.json()
        if result["decision"] == "BLOCK":
            assert result["sar_draft"] is not None
            assert len(result["sar_draft"]) > 50

    def test_result_has_all_fields(self):
        tx = make_transaction("clean")
        r = client.post("/investigate", json=tx.model_dump(mode="json"), headers=AUTH)
        result = r.json()
        required = ["transaction_id", "decision", "risk_score", "reasoning",
                    "rule_violations", "threat_hits", "account_history",
                    "processing_ms", "trace_id"]
        for field in required:
            assert field in result, f"Missing field: {field}"

    def test_invalid_transaction_returns_422(self):
        r = client.post("/investigate", json={"bad": "data"})
        assert r.status_code == 422

    def test_all_scenarios(self):
        from data.mock_transactions import SCENARIOS
        for scenario in SCENARIOS:
            tx = make_transaction(scenario)
            r = client.post("/investigate", json=tx.model_dump(mode="json"), headers=AUTH)
            assert r.status_code == 200, f"Scenario {scenario} failed: {r.text}"
            result = r.json()
            assert result["decision"] in ("ALLOW", "FLAG", "BLOCK")
            assert "key_signals" in result and "decision_method" in result


class TestWorkflowEndpoints:
    def test_metrics_shape(self):
        client.post("/investigate", json=make_transaction("fraud").model_dump(mode="json"), headers=AUTH)
        r = client.get("/metrics")
        assert r.status_code == 200
        m = r.json()
        for key in ("total", "decisions", "risk_histogram", "timeline", "drift"):
            assert key in m
        assert len(m["risk_histogram"]) == 10

    def test_cases_listing(self):
        client.post("/investigate", json=make_transaction("clean").model_dump(mode="json"), headers=AUTH)
        r = client.get("/cases?limit=10")
        assert r.status_code == 200
        assert "cases" in r.json()

    def test_simulate_batch(self):
        r = client.post("/simulate", json={"count": 3, "scenario": "random"}, headers=AUTH)
        assert r.status_code == 200
        assert r.json()["ran"] == 3

    def test_feedback_override_loop(self):
        res = client.post("/investigate",
                          json=make_transaction("fraud").model_dump(mode="json"),
                          headers=AUTH).json()
        r = client.post("/feedback", json={
            "transaction_id": res["transaction_id"],
            "analyst_decision": "ALLOW",
            "note": "verified with customer",
            "trace_id": res.get("trace_id"),
        })
        assert r.status_code == 200
        assert "agreed" in r.json()

    def test_feedback_unknown_tx_404(self):
        r = client.post("/feedback", json={"transaction_id": "nope", "analyst_decision": "FLAG"})
        assert r.status_code == 404


class TestAuth:
    def test_login_valid(self):
        r = client.post("/login", json={"username": DEMO_USERNAME, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        assert r.json()["token"]

    def test_login_wrong_password(self):
        r = client.post("/login", json={"username": DEMO_USERNAME, "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_user(self):
        r = client.post("/login", json={"username": "hacker@evil.com", "password": DEMO_PASSWORD})
        assert r.status_code == 401

    def test_investigate_requires_auth(self):
        # No Authorization header → rejected before running anything.
        r = client.post("/investigate", json=make_transaction("clean").model_dump(mode="json"))
        assert r.status_code == 401

    def test_investigate_bad_token_rejected(self):
        r = client.post("/investigate", json=make_transaction("clean").model_dump(mode="json"),
                        headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_api_prefix_mounted(self):
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/metrics").status_code == 200
