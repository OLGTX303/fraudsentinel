"""
Compliance rule engine — evaluates a transaction against a set of
configurable policy rules. Returns a list of RuleViolation objects.
"""
from __future__ import annotations
from agent.models import Transaction, RuleViolation, AccountHistory
from agent.tools.ip_classifier import classify_ip, BLOCKED_TYPES, label
from typing import List


def evaluate_rules(
    tx: Transaction,
    history: AccountHistory,
    recent_tx_count: int = 1,   # transactions in the past 5 minutes
) -> List[RuleViolation]:
    """
    Runs all rules and returns every violation found.
    Rules are ordered by severity descending.
    """
    violations: List[RuleViolation] = []

    # ── CRITICAL rules ────────────────────────────────────────────
    conn_type = classify_ip(tx.ip_address)
    if conn_type in BLOCKED_TYPES:
        violations.append(RuleViolation(
            rule_id="NET-001",
            rule_name="Datacenter/IDC IP not permitted",
            severity="CRITICAL",
            description=(
                f"Connection originates from a {label(conn_type).lower()} network "
                f"({tx.ip_address}). Policy accepts only home and business broadband; "
                f"datacenter/hosting/VPN/proxy IPs are refused."
            ),
        ))

    if tx.amount > 10_000:
        violations.append(RuleViolation(
            rule_id="CTR-001",
            rule_name="Currency Transaction Report threshold",
            severity="CRITICAL",
            description=f"Transaction amount ${tx.amount:,.2f} exceeds $10,000 CTR filing threshold.",
        ))

    # ── HIGH rules ────────────────────────────────────────────────
    if recent_tx_count >= 3:
        violations.append(RuleViolation(
            rule_id="VEL-001",
            rule_name="High velocity — multiple transactions",
            severity="HIGH",
            description=f"{recent_tx_count} transactions detected within 5 minutes on this account.",
        ))

    if tx.is_international and history.international_pct < 0.05:
        violations.append(RuleViolation(
            rule_id="GEO-001",
            rule_name="Geolocation anomaly — first international transaction",
            severity="HIGH",
            description=(
                f"Account has historically {history.international_pct*100:.0f}% international "
                f"transactions. Current transaction originates from {tx.ip_country}."
            ),
        ))

    if tx.card_country != tx.ip_country:
        violations.append(RuleViolation(
            rule_id="GEO-002",
            rule_name="Card/IP country mismatch",
            severity="HIGH",
            description=(
                f"Card registered in {tx.card_country} but transaction IP resolves to {tx.ip_country}."
            ),
        ))

    # ── MEDIUM rules ──────────────────────────────────────────────
    if tx.amount > history.max_transaction_amount * 5:
        violations.append(RuleViolation(
            rule_id="AMT-001",
            rule_name="Unusual transaction amount",
            severity="MEDIUM",
            description=(
                f"Amount ${tx.amount:,.2f} is {tx.amount/max(history.max_transaction_amount,1):.1f}x "
                f"the account's historical maximum (${history.max_transaction_amount:,.2f})."
            ),
        ))

    if history.new_device:
        violations.append(RuleViolation(
            rule_id="DEV-001",
            rule_name="New/unrecognised device",
            severity="MEDIUM",
            description=f"Device ID {tx.device_id} has never been seen on this account before.",
        ))

    odd_hour = tx.hour_of_day < 5 or tx.hour_of_day > 23
    if odd_hour and tx.hour_of_day not in history.typical_hours:
        violations.append(RuleViolation(
            rule_id="BEH-001",
            rule_name="Unusual transaction hour",
            severity="MEDIUM",
            description=(
                f"Transaction at {tx.hour_of_day:02d}:xx local time — "
                f"account typically active during hours {sorted(history.typical_hours)}."
            ),
        ))

    # ── LOW rules ─────────────────────────────────────────────────
    if tx.amount > history.avg_transaction_amount * 3:
        violations.append(RuleViolation(
            rule_id="AMT-002",
            rule_name="Amount significantly above average",
            severity="LOW",
            description=(
                f"Amount ${tx.amount:,.2f} is {tx.amount/max(history.avg_transaction_amount,1):.1f}x "
                f"account average (${history.avg_transaction_amount:,.2f})."
            ),
        ))

    return violations
