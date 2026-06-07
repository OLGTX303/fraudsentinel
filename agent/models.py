from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone


def _utcnow() -> datetime:
    """Timezone-aware UTC now (replaces deprecated datetime.utcnow)."""
    return datetime.now(timezone.utc)
import uuid


class Transaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str
    amount: float
    currency: str = "USD"
    merchant: str
    merchant_category: str
    card_country: str          # Country where card is registered
    ip_address: str
    ip_country: str
    device_id: str
    timestamp: datetime = Field(default_factory=_utcnow)
    is_international: bool = False
    hour_of_day: int = 12      # 0-23
    card_token: str = "0000"   # opaque card identifier checked against the blocklist
    payment_method: Literal["card", "apple_pay", "google_pay", "paypal"] = "card"


class RiskScore(BaseModel):
    score: float               # 0.0 = clean, 1.0 = definite fraud
    confidence: float
    top_features: List[str]


class RuleViolation(BaseModel):
    rule_id: str
    rule_name: str
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    description: str


class ThreatHit(BaseModel):
    ip_flagged: bool
    card_flagged: bool
    ip_reason: Optional[str] = None
    card_reason: Optional[str] = None
    risk_level: Literal["NONE", "LOW", "MEDIUM", "HIGH"]


class AccountHistory(BaseModel):
    account_id: str
    avg_transaction_amount: float
    max_transaction_amount: float
    typical_countries: List[str]
    typical_hours: List[int]     # Typical active hours
    transaction_count_90d: int
    international_pct: float     # 0.0-1.0
    new_device: bool             # True if device_id never seen before


class InvestigationResult(BaseModel):
    transaction_id: str
    decision: Literal["ALLOW", "FLAG", "BLOCK"]
    risk_score: float
    reasoning: str               # Plain-English explanation from Gemini
    rule_violations: List[RuleViolation]
    threat_hits: ThreatHit
    account_history: AccountHistory
    sar_draft: Optional[str] = None
    processing_ms: int
    timestamp: datetime = Field(default_factory=_utcnow)
    trace_id: Optional[str] = None
    # ── Agentic / workflow metadata ───────────────────────────────
    decision_method: Literal["agentic", "pipeline"] = "pipeline"
    key_signals: List[str] = Field(default_factory=list)   # bullet drivers of the decision
    related_activity: Optional[dict] = None                # deeper lookup the agent chose to run
    scenario: Optional[str] = None                         # demo label, if known
    merchant: Optional[str] = None                         # echoed for the case table
    amount: Optional[float] = None
    account_id: Optional[str] = None
    payment_method: Optional[str] = None                   # card / apple_pay / google_pay / paypal
    ip_connection_type: Optional[str] = None               # residential / business / datacenter / mobile
    analyst_override: Optional[str] = None                 # set via /feedback (human-in-loop)


class FeedbackRequest(BaseModel):
    trace_id: Optional[str] = None
    transaction_id: str
    analyst_decision: Literal["ALLOW", "FLAG", "BLOCK"]
    note: Optional[str] = None


class SimulateRequest(BaseModel):
    count: int = 10
    scenario: str = "random"   # "random" or a named scenario


class LoginRequest(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    message: str
    transaction_id: Optional[str] = None   # ask about a specific case, else the latest


class WebSocketMessage(BaseModel):
    type: Literal["investigation_start", "tool_call", "tool_result",
                  "reasoning", "decision", "sar_draft", "complete", "error"]
    payload: dict
    timestamp: datetime = Field(default_factory=_utcnow)
