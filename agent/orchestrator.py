"""
FraudSentinel orchestrator — FastAPI app that exposes:
  POST /investigate          → run a full investigation, returns JSON result
  GET  /ws/{client_id}       → WebSocket for real-time streaming updates
  GET  /health               → health check
  GET  /scenarios            → list demo scenarios

Google Gemini (via the google-genai SDK on Vertex AI or the Gemini API)
handles the reasoning step. All tool calls are instrumented through the
Arize tracer using OpenTelemetry / OpenInference spans.
"""
from __future__ import annotations
import asyncio
import json
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from rich.console import Console

load_dotenv()

# Ensure UTF-8 stdout so the rich console (✓, emoji) never crashes on a
# legacy Windows code page (e.g. GBK) when run outside a UTF-8 terminal.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import hashlib
import hmac

from agent.models import (
    Transaction, InvestigationResult, WebSocketMessage,
    RuleViolation, ThreatHit, AccountHistory,
    FeedbackRequest, SimulateRequest, LoginRequest, ChatRequest, ApplePayValidateRequest,
    StripeIntentRequest, StripeFinalizeRequest,
)
from agent.tools.risk_scorer import score_transaction
from agent.tools.rule_engine import evaluate_rules
from agent.tools.threat_feed import check_threat_feeds
from agent.tools.history_lookup import get_account_history, get_related_transactions
from agent.tools.ip_classifier import classify_ip, label as ip_label
from agent.tools.bin_check import bin_check, bin_violations
from agent.prompts.investigation import (
    INVESTIGATION_SYSTEM, build_investigation_prompt,
    SAR_SYSTEM, build_sar_prompt,
)
from arize_integration.tracer import ArizeTracer

console = Console()

# ── Gemini configuration ──────────────────────────────────────────
# Default to a widely-available Gemini model; override with GEMINI_MODEL.
# (e.g. gemini-2.5-flash, gemini-2.5-pro, or gemini-3-pro-preview).
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# Agent mode: "auto" → agentic when Gemini creds present, else deterministic
# pipeline. Force with AGENT_MODE=agentic | pipeline.
AGENT_MODE = os.getenv("AGENT_MODE", "auto").lower()

# ── Single demo account (the ONLY way in) ─────────────────────────
# Password is validated server-side and never shipped to the browser.
DEMO_USERNAME = os.getenv("DEMO_USERNAME", "analyst@fraudsentinel.ai")
# NOTE: real credentials are supplied via the (git-ignored) .env on the server.
# These source defaults are placeholders only — never commit live secrets.
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "change-me-in-env")
AUTH_SECRET   = os.getenv("AUTH_SECRET", "change-me-in-env")
# Stable opaque session token derived from the credential + secret.
AUTH_TOKEN = hashlib.sha256(
    f"{DEMO_USERNAME}:{DEMO_PASSWORD}:{AUTH_SECRET}".encode()).hexdigest()


def _valid_token(token: str | None) -> bool:
    return bool(token) and hmac.compare_digest(token, AUTH_TOKEN)


def _require_auth(request: Request):
    """401 unless a valid Bearer token (from /login) is present."""
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not _valid_token(token):
        raise HTTPException(status_code=401, detail="Authentication required.")

# ── Global state ──────────────────────────────────────────────────
active_connections: Dict[str, WebSocket] = {}
tracer = ArizeTracer()

# Lazily-initialised google-genai client (reused across requests)
_genai_client = None

# Server-side rolling stores powering /metrics, /cases and /feedback.
_results: list[InvestigationResult] = []      # recent investigations (newest last)
_feedback: list[dict] = []                    # analyst overrides (human-in-the-loop)
_RESULTS_CAP = 500


def _store_result(result: InvestigationResult):
    _results.append(result)
    if len(_results) > _RESULTS_CAP:
        _results.pop(0)


# ── Demo rate limiting (per client IP + global daily cap) ─────────
# Protects the shared demo (and the Gemini budget) from abuse by many users
# across different countries. Tunable via env.
import datetime as _dt

_RL_WINDOW_S    = int(os.getenv("RL_WINDOW_S", "600"))        # 10-minute window
_RL_MAX_PER_IP  = int(os.getenv("RL_MAX_PER_IP", "20"))       # investigations / window / IP
_RL_GLOBAL_DAY  = int(os.getenv("RL_GLOBAL_DAY", "1000"))     # global investigations / day
_rl_hits: Dict[str, list] = {}
_rl_day = {"date": "", "count": 0}


def _client_ip(headers, fallback: str = "anon") -> str:
    xff = headers.get("x-forwarded-for") or headers.get("x-real-ip")
    return xff.split(",")[0].strip() if xff else (fallback or "anon")


def _rate_ok(ip: str, cost: int = 1) -> tuple[bool, str]:
    """Returns (allowed, message). Counts `cost` investigations against the limits."""
    now = time.time()
    today = _dt.date.today().isoformat()
    if _rl_day["date"] != today:
        _rl_day["date"], _rl_day["count"] = today, 0
    if _rl_day["count"] + cost > _RL_GLOBAL_DAY:
        return False, "The shared demo has hit its daily limit. Please try again tomorrow."
    hits = [t for t in _rl_hits.get(ip, []) if now - t < _RL_WINDOW_S]
    if len(hits) + cost > _RL_MAX_PER_IP:
        mins = _RL_WINDOW_S // 60
        return False, f"Demo limit reached ({_RL_MAX_PER_IP} runs / {mins} min). Please slow down."
    hits.extend([now] * cost)
    _rl_hits[ip] = hits
    _rl_day["count"] += cost
    if len(_rl_hits) > 10000:
        _rl_hits.clear()
    return True, ""


# ── WebSocket helpers ─────────────────────────────────────────────
async def ws_send(client_id: str, msg: WebSocketMessage):
    ws = active_connections.get(client_id)
    if ws:
        try:
            await ws.send_text(msg.model_dump_json())
        except Exception:
            pass


# ── Core investigation pipeline ───────────────────────────────────
async def run_investigation(
    tx: Transaction,
    client_id: str | None = None,
    scenario: str | None = None,
) -> InvestigationResult:
    """
    Full investigation pipeline:
      1. Get account history
      2. Score risk (ML)
      3. Evaluate compliance rules
      4. Check threat feeds
      5. Gemini reasoning → decision + explanation
      6. Draft SAR if BLOCK
      7. Log everything to Arize
    """
    start_ms = time.time()
    trace_id = str(uuid.uuid4())

    async def emit(type_: str, payload: dict):
        if client_id:
            await ws_send(client_id, WebSocketMessage(type=type_, payload=payload))

    await emit("investigation_start", {
        "transaction_id": tx.transaction_id,
        "account_id": tx.account_id,
        "amount": tx.amount,
        "merchant": tx.merchant,
        "trace_id": trace_id,
    })

    # ── Step 1: Account history ───────────────────────────────────
    await emit("tool_call", {"tool": "history_lookup", "inputs": {"account_id": tx.account_id}})
    history = await asyncio.to_thread(get_account_history, tx.account_id, tx.device_id)
    await emit("tool_result", {"tool": "history_lookup", "result": history.model_dump()})
    tracer.log_span("history_lookup", {"account_id": tx.account_id}, history.model_dump(), trace_id)

    # ── Step 2: Risk score ────────────────────────────────────────
    await emit("tool_call", {"tool": "risk_scorer", "inputs": {"transaction_id": tx.transaction_id}})
    risk = await asyncio.to_thread(score_transaction, tx)
    await emit("tool_result", {"tool": "risk_scorer", "result": risk.model_dump()})
    tracer.log_span("risk_scorer", {"transaction_id": tx.transaction_id}, risk.model_dump(), trace_id)

    # ── Step 3: Rule engine ───────────────────────────────────────
    await emit("tool_call", {"tool": "rule_engine", "inputs": {"transaction_id": tx.transaction_id}})
    violations = await asyncio.to_thread(evaluate_rules, tx, history)
    await emit("tool_result", {"tool": "rule_engine",
                               "result": [v.model_dump() for v in violations]})
    tracer.log_span("rule_engine", {"transaction_id": tx.transaction_id},
                    [v.model_dump() for v in violations], trace_id)

    # ── Step 4: Threat feed ───────────────────────────────────────
    await emit("tool_call", {"tool": "threat_feed", "inputs": {"ip": tx.ip_address}})
    threats = await asyncio.to_thread(check_threat_feeds, tx, tx.card_token)
    await emit("tool_result", {"tool": "threat_feed", "result": threats.model_dump()})
    tracer.log_span("threat_feed", {"ip": tx.ip_address}, threats.model_dump(), trace_id)

    # ── Step 4.5: Card BIN pre-check (fraud control) ──────────────
    await emit("tool_call", {"tool": "bin_check", "inputs": {"method": tx.payment_method}})
    bin_info = await asyncio.to_thread(bin_check, tx.card_token, tx.card_country)
    await emit("tool_result", {"tool": "bin_check", "result": bin_info})
    tracer.log_span("bin_check", {"card_token": "***", "country": tx.card_country}, bin_info, trace_id)
    for bv in bin_violations(bin_info):
        violations.append(RuleViolation(**bv))

    # ── Step 5: Gemini reasoning (agentic when creds present) ─────
    await emit("tool_call", {"tool": "gemini_reasoning",
                             "inputs": {"model": GEMINI_MODEL, "mode": AGENT_MODE}})

    investigation_prompt = build_investigation_prompt(
        transaction_json=tx.model_dump_json(indent=2),
        risk_score_json=risk.model_dump_json(indent=2),
        violations_json=json.dumps([v.model_dump() for v in violations], indent=2),
        threat_json=threats.model_dump_json(indent=2),
        history_json=history.model_dump_json(indent=2),
    )

    reasoning_text, decision, key_signals, related_activity, method = await _reason(
        tx=tx, prompt=investigation_prompt, emit=emit, trace_id=trace_id,
        evidence={"risk": risk, "violations": violations, "threats": threats},
    )
    if not key_signals:
        key_signals = _derive_signals(decision, violations, threats, risk)
    await emit("tool_result", {"tool": "gemini_reasoning",
                               "result": {"decision": decision, "reasoning": reasoning_text,
                                          "method": method}})
    await emit("reasoning", {"text": reasoning_text, "decision": decision,
                             "key_signals": key_signals, "method": method})
    tracer.log_llm_span("investigation_reasoning", INVESTIGATION_SYSTEM,
                        investigation_prompt, reasoning_text, trace_id)

    await emit("decision", {"decision": decision, "risk_score": risk.score})

    # ── Step 6: SAR draft (only for BLOCK) ───────────────────────
    sar_draft: str | None = None
    if decision == "BLOCK":
        await emit("tool_call", {"tool": "sar_drafter", "inputs": {"decision": "BLOCK"}})
        summary = (
            f"Transaction ID: {tx.transaction_id}\n"
            f"Account: {tx.account_id}\n"
            f"Amount: ${tx.amount:,.2f} {tx.currency}\n"
            f"Merchant: {tx.merchant}\n"
            f"Decision: BLOCK\n"
            f"Risk score: {risk.score}\n"
            f"Reasoning: {reasoning_text}\n"
            f"Violations: {json.dumps([v.model_dump() for v in violations])}\n"
            f"Threat hits: {threats.model_dump_json()}\n"
            f"Account history: avg=${history.avg_transaction_amount:.0f}, "
            f"int'l={history.international_pct*100:.0f}%"
        )
        if _get_genai_client() is None:
            sar_draft = _demo_sar(tx, risk, reasoning_text, violations, threats)
        else:
            try:
                sar_draft, _ = await _call_gemini(
                    system=SAR_SYSTEM,
                    user=build_sar_prompt(summary),
                )
            except Exception:
                sar_draft = _demo_sar(tx, risk, reasoning_text, violations, threats)
        await emit("sar_draft", {"text": sar_draft})
        tracer.log_llm_span("sar_draft", SAR_SYSTEM, summary, sar_draft, trace_id)
        tracer.log_prompt_quality(sar_draft, trace_id)

    # ── Step 7: Final result ──────────────────────────────────────
    elapsed_ms = int((time.time() - start_ms) * 1000)
    result = InvestigationResult(
        transaction_id=tx.transaction_id,
        decision=decision,
        risk_score=risk.score,
        reasoning=reasoning_text,
        rule_violations=violations,
        threat_hits=threats,
        account_history=history,
        sar_draft=sar_draft,
        processing_ms=elapsed_ms,
        trace_id=trace_id,
        decision_method=method,
        key_signals=key_signals,
        related_activity=related_activity,
        scenario=scenario,
        merchant=tx.merchant,
        amount=tx.amount,
        account_id=tx.account_id,
        payment_method=tx.payment_method,
        ip_connection_type=classify_ip(tx.ip_address),
        bin_info=bin_info,
    )
    tracer.log_investigation(result)
    _store_result(result)
    await emit("complete", result.model_dump(mode="json"))

    console.print(
        f"[bold {'red' if decision=='BLOCK' else 'yellow' if decision=='FLAG' else 'green'}]"
        f"  {decision}[/] — {tx.transaction_id} — {elapsed_ms}ms — risk={risk.score}"
    )
    return result


def _get_genai_client():
    """
    Build (once) a google-genai client.

    Two authentication modes are supported, picked automatically:
      1. Vertex AI  — set GOOGLE_GENAI_USE_VERTEXAI=true plus
                       GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION
                       (uses Application Default Credentials — the path
                       used on Google Cloud Run / Agent Builder).
      2. Gemini API — set GOOGLE_API_KEY (or GEMINI_API_KEY).

    Returns None if neither is configured (caller uses the demo fallback).
    """
    global _genai_client
    if _genai_client is not None:
        return _genai_client

    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes")
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "")

    if not use_vertex and (not api_key or api_key in ("", "your-gemini-api-key")):
        if not project:
            return None  # nothing configured → demo fallback

    try:
        from google import genai

        if use_vertex or (project and not api_key):
            _genai_client = genai.Client(
                vertexai=True,
                project=project or None,
                location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
            console.print(f"[green]✓ Gemini via Vertex AI ({GEMINI_MODEL})[/green]")
        else:
            _genai_client = genai.Client(api_key=api_key)
            console.print(f"[green]✓ Gemini via Gemini API ({GEMINI_MODEL})[/green]")
        return _genai_client
    except Exception as e:
        console.print(f"[yellow]google-genai init error: {e} — using demo fallback[/yellow]")
        return None


async def _call_gemini(system: str, user: str) -> tuple[str, str]:
    """
    Calls Gemini via the google-genai SDK (Vertex AI or Gemini API).
    Returns (text, decision) where decision is extracted if the response is JSON.
    """
    client = _get_genai_client()
    if client is None:
        # Demo fallback — no Google credentials needed for basic testing
        return _demo_reasoning_fallback(system), "BLOCK"

    try:
        from google.genai import types

        # Gemini's SDK is sync; run it off the event loop.
        def _invoke() -> str:
            resp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=1024,
                    temperature=0.2,
                ),
            )
            return (resp.text or "").strip()

        text = await asyncio.to_thread(_invoke)

        # Gemini may wrap JSON in ```json fences — strip them.
        if text.startswith("```"):
            text = text.strip("`")
            text = text[text.find("\n") + 1:] if "\n" in text else text
            if text.lower().startswith("json"):
                text = text[4:].lstrip()

        # Try to parse a JSON decision payload
        decision = "FLAG"
        try:
            data = json.loads(text)
            decision = data.get("decision", "FLAG")
            text = data.get("reasoning", text)
        except json.JSONDecodeError:
            # Response wasn't JSON — extract decision keyword
            for d in ["BLOCK", "FLAG", "ALLOW"]:
                if d in text.upper():
                    decision = d
                    break
        return text, decision

    except Exception as e:
        # Re-raise so callers can fall back to the evidence-based heuristic
        # (a blind "FLAG" would hide real BLOCK/ALLOW signals).
        console.print(f"[yellow]Gemini API error: {str(e)[:120]}[/yellow]")
        raise


def _derive_signals(decision: str, violations, threats, risk) -> list[str]:
    """Cheap, explainable bullet drivers used when running the deterministic path."""
    signals: list[str] = []
    for v in sorted(violations, key=lambda x: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].index(x.severity),
                    reverse=True)[:3]:
        signals.append(f"{v.severity}: {v.rule_name}")
    if threats.ip_flagged and threats.ip_reason:
        signals.append(f"Threat intel: {threats.ip_reason}")
    if threats.card_flagged and threats.card_reason:
        signals.append(f"Card flagged: {threats.card_reason}")
    signals.append(f"ML risk score {risk.score:.2f}")
    return signals[:5]


def _heuristic_decision(risk, violations, threats) -> str:
    """Deterministic decision matching the rubric in INVESTIGATION_SYSTEM.
    Used in demo mode (no Gemini creds) so the agent still behaves sensibly."""
    has_threat = threats.ip_flagged or threats.card_flagged
    high_viol = any(v.severity in ("HIGH", "CRITICAL") for v in violations)
    if risk.score > 0.7 or high_viol or has_threat:
        return "BLOCK"
    if risk.score < 0.4 and len(violations) < 2:
        return "ALLOW"
    return "FLAG"


def _demo_reasoning(tx, risk, violations, threats, decision) -> str:
    """Evidence-grounded reasoning string for demo mode (varies per transaction)."""
    bits = []
    if tx.card_country != tx.ip_country:
        bits.append(f"the card is registered in {tx.card_country} but the IP resolves to {tx.ip_country}")
    if threats.ip_flagged and threats.ip_reason:
        bits.append(f"the source IP is flagged ({threats.ip_reason.lower()})")
    top = sorted(violations, key=lambda v: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].index(v.severity),
                 reverse=True)
    if top:
        bits.append(f"{len(violations)} policy violation(s), most severe being {top[0].rule_name.lower()}")
    if tx.hour_of_day < 5 or tx.hour_of_day > 23:
        bits.append(f"an unusual transaction hour ({tx.hour_of_day:02d}:00)")
    evidence = "; ".join(bits) if bits else "no material risk indicators"
    verb = {"BLOCK": "blocked", "FLAG": "flagged for review", "ALLOW": "allowed"}[decision]
    return (f"This ${tx.amount:,.0f} transaction at {tx.merchant} was {verb}. "
            f"Key factors: {evidence}. The ML risk model scored the transaction at "
            f"{risk.score:.2f}. Decision: {decision}.")


def _demo_sar(tx, risk, reasoning, violations, threats) -> str:
    """Evidence-grounded SAR narrative for demo mode (no Gemini required)."""
    viol_lines = "; ".join(f"{v.rule_id} {v.rule_name}" for v in violations[:4]) or "none recorded"
    threat_line = threats.ip_reason or threats.card_reason or "no threat-feed match"
    return (
        "SUSPICIOUS ACTIVITY REPORT — NARRATIVE (DRAFT)\n\n"
        f"On {tx.timestamp:%Y-%m-%d %H:%M UTC}, an automated transaction monitoring agent "
        f"detected suspicious activity on account {tx.account_id}. A transaction of "
        f"${tx.amount:,.2f} {tx.currency} to {tx.merchant} ({tx.merchant_category}) was "
        f"identified as high risk and blocked.\n\n"
        f"The card is registered in {tx.card_country} while the originating IP "
        f"({tx.ip_address}) resolves to {tx.ip_country}. The ML fraud model assigned a "
        f"probability of {risk.score:.2f}. Threat intelligence: {threat_line}. "
        f"Policy violations triggered: {viol_lines}.\n\n"
        f"Analyst summary: {reasoning}\n\n"
        "Recommended action: maintain block, freeze the account pending customer "
        "verification, and review related activity for connected fraud patterns. "
        "This draft requires compliance review before filing with FinCEN."
    )


async def _reason(tx, prompt, emit, trace_id, evidence):
    """
    Produce (reasoning, decision, key_signals, related_activity, method).

    Agentic mode: Gemini decides — it may call `lookup_related_transactions`
    for deeper context before calling `submit_decision`. Falls back to the
    deterministic pipeline (real Gemini JSON if creds present, else an
    evidence-grounded heuristic) on any error or when no creds are present.
    """
    risk, violations, threats = evidence["risk"], evidence["violations"], evidence["threats"]
    client = _get_genai_client()

    if AGENT_MODE != "pipeline" and client is not None:
        try:
            return await _agentic_decision(client, tx, prompt, emit, trace_id)
        except Exception as e:
            console.print(f"[yellow]Agentic loop error: {e} — falling back to pipeline[/yellow]")

    if client is not None:
        try:
            reasoning_text, decision = await _call_gemini(system=INVESTIGATION_SYSTEM, user=prompt)
            return reasoning_text, decision, [], None, "pipeline"
        except Exception:
            console.print("[yellow]Falling back to evidence-based heuristic decision[/yellow]")

    # No Gemini (or it failed) → realistic, evidence-grounded decision.
    decision = _heuristic_decision(risk, violations, threats)
    reasoning_text = _demo_reasoning(tx, risk, violations, threats, decision)
    return reasoning_text, decision, [], None, "pipeline"


async def _agentic_decision(client, tx, prompt, emit, trace_id):
    """Gemini function-calling loop. Raises on any SDK issue so the caller falls back."""
    from google.genai import types

    related_activity = None

    tools = types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="lookup_related_transactions",
            description="Fetch the account's recent 24h activity (volume, distinct "
                        "merchants, total spend, rapid-succession flag). Call this when "
                        "the evidence is ambiguous and recent behaviour would change the call.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"account_id": types.Schema(type="STRING")},
                required=["account_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="submit_decision",
            description="Finalise the investigation. Always call this exactly once.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "decision": types.Schema(type="STRING", enum=["ALLOW", "FLAG", "BLOCK"]),
                    "reasoning": types.Schema(type="STRING",
                                              description="3-6 sentence plain-English justification."),
                    "key_signals": types.Schema(
                        type="ARRAY", items=types.Schema(type="STRING"),
                        description="3-5 short bullet drivers of the decision."),
                },
                required=["decision", "reasoning", "key_signals"],
            ),
        ),
    ])
    config = types.GenerateContentConfig(
        system_instruction=INVESTIGATION_SYSTEM + "\nYou are an autonomous agent: gather any "
                           "extra context you need by calling tools, then call submit_decision.",
        tools=[tools],
        temperature=0.2,
    )

    contents = [types.Content(role="user", parts=[types.Part(text=prompt)])]

    for _ in range(4):
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL, contents=contents, config=config,
        )
        calls = getattr(resp, "function_calls", None) or []
        if not calls:
            # Model answered without the terminal tool — parse free text.
            text = (resp.text or "").strip()
            decision = next((d for d in ("BLOCK", "FLAG", "ALLOW") if d in text.upper()), "FLAG")
            return text, decision, [], related_activity, "agentic"

        contents.append(resp.candidates[0].content)
        responses = []
        for call in calls:
            if call.name == "submit_decision":
                args = dict(call.args)
                return (args.get("reasoning", ""), args.get("decision", "FLAG"),
                        list(args.get("key_signals", [])), related_activity, "agentic")
            if call.name == "lookup_related_transactions":
                await emit("tool_call", {"tool": "related_lookup",
                                         "inputs": {"account_id": tx.account_id}})
                related_activity = await asyncio.to_thread(get_related_transactions, tx.account_id)
                await emit("tool_result", {"tool": "related_lookup", "result": related_activity})
                tracer.log_span("related_lookup", {"account_id": tx.account_id},
                                related_activity, trace_id)
                responses.append(types.Part.from_function_response(
                    name=call.name, response=related_activity))
        if responses:
            contents.append(types.Content(role="tool", parts=responses))

    # Loop exhausted without a decision — let the caller fall back.
    raise RuntimeError("agent did not submit a decision")


def _demo_reasoning_fallback(system: str) -> str:
    """Returns a canned reasoning string when no API key is set."""
    if "SAR" in system:
        return (
            "SUSPICIOUS ACTIVITY REPORT — NARRATIVE\n\n"
            "On the date and time indicated, an unauthorized transaction attempt was detected "
            "on account ACC-FRAUD-001. The transaction of $4,200.00 USD originated from an IP "
            "address (185.220.x.x) associated with a known fraud ring operating from Moldova, "
            "while the card is registered in the United Kingdom. The device used has never "
            "previously been seen on this account. Historical analysis shows this account has "
            "zero prior international transactions and an average transaction amount of $85. "
            "Three velocity violations were detected in a 5-minute window. The ML risk model "
            "assigned a fraud probability of 0.94. The transaction has been blocked. "
            "Recommend immediate account freeze and customer notification."
        )
    return (
        "This transaction presents multiple high-confidence fraud indicators. "
        "The card is registered in the UK but the IP resolves to Moldova — a country "
        "never previously associated with this account. The amount ($4,200) is nearly "
        "50x the account's historical average ($85) and the device has never been seen before. "
        "Threat intelligence confirms the source IP is linked to a known fraud ring. "
        "Decision: BLOCK."
    )


# ── FastAPI app ───────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    console.print("[bold blue]FraudSentinel agent starting...[/bold blue]")
    tracer.setup_drift_monitor()
    console.print("[green]✓ Arize tracer initialised[/green]")
    console.print("[green]✓ Drift monitor active[/green]")
    console.print(f"[green]✓ Demo mode: {os.getenv('DEMO_MODE', 'true')}[/green]")
    console.print("[bold green]FraudSentinel ready ✓[/bold green]\n")
    yield
    console.print("[yellow]Shutting down — flushing Arize spans...[/yellow]")
    tracer.flush()


app = FastAPI(
    title="FraudSentinel",
    description="Real-time fraud investigation agent with Arize AI observability",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# HTTP endpoints live on a router that is mounted twice: at the root (used by
# the CLI, tests, and the dev Vite proxy) and under /api (used by the dashboard
# when both are served from one Cloud Run service).
api = APIRouter()


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "demo_mode": os.getenv("DEMO_MODE", "true") == "true",
        "model": GEMINI_MODEL,
    }


@api.post("/login")
async def login(req: LoginRequest):
    """The only authentication path: the single demo account + complex password."""
    user_ok = req.username.strip().lower() == DEMO_USERNAME.lower()
    pass_ok = hmac.compare_digest(req.password, DEMO_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {
        "token": AUTH_TOKEN,
        "user": {"email": DEMO_USERNAME, "name": "Demo Analyst", "role": "Fraud analyst"},
    }


@api.get("/scenarios")
async def scenarios():
    from data.mock_transactions import SCENARIOS
    return {"scenarios": list(SCENARIOS.keys())}


@api.get("/drift-status")
async def drift_status():
    return tracer.get_drift_status()


@api.get("/spans")
async def recent_spans(limit: int = 50):
    return {"spans": tracer.get_recent_spans(limit)}


@api.post("/investigate", response_model=InvestigationResult)
async def investigate(tx: Transaction, request: Request):
    _require_auth(request)
    ok, msg = _rate_ok(_client_ip(request.headers,
                                  request.client.host if request.client else "anon"))
    if not ok:
        raise HTTPException(status_code=429, detail=msg)
    return await run_investigation(tx)


@api.get("/cases")
async def cases(limit: int = 100):
    """Recent investigations, newest first — powers the case queue table."""
    items = [r.model_dump(mode="json") for r in reversed(_results[-limit:])]
    return {"cases": items, "total": len(_results)}


@api.get("/cases/{transaction_id}")
async def case_detail(transaction_id: str):
    for r in reversed(_results):
        if r.transaction_id == transaction_id:
            return r.model_dump(mode="json")
    raise HTTPException(status_code=404, detail="case not found")


@api.get("/trace/{trace_id}")
async def trace(trace_id: str):
    """All spans belonging to one investigation — powers the trace waterfall."""
    spans = [s for s in tracer.get_recent_spans(500) if s.get("trace_id") == trace_id]
    return {"trace_id": trace_id, "spans": spans}


@api.get("/metrics")
async def metrics():
    """Aggregate analytics across recent investigations."""
    n = len(_results)
    counts = {"ALLOW": 0, "FLAG": 0, "BLOCK": 0}
    latencies, scores = [], []
    histogram = [0] * 10            # risk-score buckets 0.0–1.0
    timeline = []                   # last 30 decisions for the spark timeline
    for r in _results:
        counts[r.decision] = counts.get(r.decision, 0) + 1
        latencies.append(r.processing_ms)
        scores.append(r.risk_score)
        histogram[min(int(r.risk_score * 10), 9)] += 1
    for r in _results[-30:]:
        timeline.append({"decision": r.decision, "risk_score": round(r.risk_score, 3)})
    overrides = len(_feedback)
    disagreements = sum(1 for f in _feedback if not f.get("agreed"))
    agreement = round(1 - disagreements / overrides, 3) if overrides else None
    return {
        "total": n,
        "decisions": counts,
        "avg_latency_ms": round(sum(latencies) / n, 1) if n else 0,
        "p95_latency_ms": sorted(latencies)[int(n * 0.95)] if n else 0,
        "avg_risk": round(sum(scores) / n, 3) if n else 0,
        "risk_histogram": histogram,
        "timeline": timeline,
        "drift": tracer.get_drift_status(),
        "feedback": {"total": overrides, "agreement_rate": agreement},
        "agentic_count": sum(1 for r in _results if r.decision_method == "agentic"),
    }


@api.post("/applepay/validate")
async def applepay_validate(req: ApplePayValidateRequest, request: Request):
    """Apple Pay merchant validation. Performs the real mTLS call to Apple only
    when an Apple merchant identity cert is configured; otherwise returns 501 so
    the frontend falls back gracefully (the native sheet/QR still appears)."""
    _require_auth(request)
    cert = os.getenv("APPLEPAY_MERCHANT_CERT", "")          # path to PEM cert(+key)
    mid = os.getenv("APPLEPAY_MERCHANT_ID", "")
    domain = os.getenv("APPLEPAY_DOMAIN", "fraudsentinel.olgtx.dpdns.org")
    if not (cert and mid):
        raise HTTPException(status_code=501,
                            detail="Apple Pay merchant validation not configured "
                                   "(set APPLEPAY_MERCHANT_CERT + APPLEPAY_MERCHANT_ID).")
    # Only Apple's own apple-pay-gateway domains are valid validation URLs.
    if "apple-pay-gateway" not in req.validationURL and "apple.com" not in req.validationURL:
        raise HTTPException(status_code=400, detail="Invalid validation URL.")
    import httpx
    payload = {"merchantIdentifier": mid, "displayName": "FraudSentinel",
               "initiative": "web", "initiativeContext": domain}
    async with httpx.AsyncClient(cert=cert, timeout=15.0) as client:
        r = await client.post(req.validationURL, json=payload)
        return r.json()


# ── Stripe: real payment collection, analysed by our own agent ────────
# The secret key never leaves the backend. We authorise with manual capture so
# FraudSentinel decides whether the money actually moves: ALLOW/FLAG → capture,
# BLOCK → void the authorisation.
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

# Per-brand representative BIN so the BIN pre-check tool still has a 6-digit IIN
# (Stripe only returns brand + last4, never the full PAN).
_BRAND_BIN = {
    "visa": "424242", "mastercard": "555555", "amex": "378282",
    "unionpay": "620000", "discover": "601111", "jcb": "353011",
    "diners": "305693",
}


def _stripe():
    """Lazily import + configure the Stripe SDK; raise 501 if not set up."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=501, detail="Stripe is not configured (set STRIPE_SECRET_KEY).")
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


@api.get("/stripe/config")
async def stripe_config():
    """Publishable key for Stripe.js (safe to expose) + whether Stripe is live."""
    return {"enabled": bool(STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY),
            "publishable_key": STRIPE_PUBLISHABLE_KEY}


@api.post("/stripe/intent")
async def stripe_intent(req: StripeIntentRequest, request: Request):
    """Create a manual-capture PaymentIntent so the agent gates the capture."""
    _require_auth(request)
    stripe = _stripe()
    intent = stripe.PaymentIntent.create(
        amount=max(50, int(round(req.amount * 100))),     # cents; Stripe min ~$0.50
        currency=req.currency.lower(),
        capture_method="manual",
        automatic_payment_methods={"enabled": True},
        description="FraudSentinel agent-gated authorisation",
    )
    return {"client_secret": intent.client_secret, "id": intent.id}


@api.get("/stripe/card/{intent_id}")
async def stripe_card(intent_id: str, request: Request):
    """Retrieve the REAL card metadata Stripe captured (brand, last4, country, funding)."""
    _require_auth(request)
    stripe = _stripe()
    # Stripe objects support attribute access (not dict.get on the top object).
    intent = stripe.PaymentIntent.retrieve(intent_id, expand=["payment_method"])
    pm = getattr(intent, "payment_method", None)
    card = getattr(pm, "card", None) if pm is not None else None
    brand = getattr(card, "brand", None) if card is not None else None
    wallet_obj = getattr(card, "wallet", None) if card is not None else None
    wallet_type = getattr(wallet_obj, "type", None) if wallet_obj is not None else None
    return {
        "type": getattr(pm, "type", None) if pm is not None else None,  # card / paypal / link / ...
        "brand": brand,
        "last4": getattr(card, "last4", None) if card is not None else None,
        "funding": getattr(card, "funding", None) if card is not None else None,
        "country": getattr(card, "country", None) if card is not None else None,
        "wallet": wallet_type,
        "bin": _BRAND_BIN.get((brand or "").lower(), "000000"),
        "status": getattr(intent, "status", None),
    }


@api.post("/stripe/finalize")
async def stripe_finalize(req: StripeFinalizeRequest, request: Request):
    """The agent's verdict moves (or voids) the money: ALLOW/FLAG capture, BLOCK void."""
    _require_auth(request)
    stripe = _stripe()
    try:
        pi = stripe.PaymentIntent.retrieve(req.payment_intent_id)
        status = getattr(pi, "status", "")
        if req.decision == "BLOCK":
            # Already-terminal authorisations count as voided for the demo.
            if status in ("canceled",):
                return {"action": "voided", "status": status}
            if status in ("requires_capture", "requires_confirmation", "requires_action",
                          "requires_payment_method", "processing"):
                intent = stripe.PaymentIntent.cancel(req.payment_intent_id)
                return {"action": "voided", "status": getattr(intent, "status", "canceled")}
            return {"action": "voided", "status": status}   # nothing captured → effectively void
        # ALLOW / FLAG → capture the authorised funds.
        if status == "requires_capture":
            intent = stripe.PaymentIntent.capture(req.payment_intent_id)
            return {"action": "captured", "status": getattr(intent, "status", "succeeded")}
        if status == "succeeded":
            return {"action": "captured", "status": status}
        return {"action": "noop", "status": status}
    except Exception as e:
        console.print(f"[red]stripe finalize error:[/red] {e}")
        return {"action": "noop", "status": "error", "detail": str(e)[:200]}


@api.post("/feedback")
async def feedback(req: FeedbackRequest):
    """Human-in-the-loop: an analyst confirms or overrides the agent's call."""
    agent_decision = None
    for r in reversed(_results):
        if r.transaction_id == req.transaction_id:
            agent_decision = r.decision
            r.analyst_override = req.analyst_decision
            break
    if agent_decision is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    agreed = agent_decision == req.analyst_decision
    record = {
        "transaction_id": req.transaction_id,
        "agent_decision": agent_decision,
        "analyst_decision": req.analyst_decision,
        "agreed": agreed,
        "note": req.note or "",
    }
    _feedback.append(record)
    tracer.log_feedback(req.transaction_id, agent_decision, req.analyst_decision,
                        req.note or "", req.trace_id)
    return {"ok": True, "agreed": agreed}


_PM_LABEL = {"card": "Credit card", "apple_pay": "Apple Pay",
             "google_pay": "Google Pay", "paypal": "PayPal"}
_PM_NOTE = {
    "card": "raw card credentials — highest fraud exposure; verify AVS/CVV and velocity.",
    "apple_pay": "device-bound tokenised credential with biometric auth — strong signal, low fraud risk.",
    "google_pay": "tokenised credential with device attestation — generally low fraud risk.",
    "paypal": "wallet with PayPal-side buyer auth — medium risk; watch for account takeover.",
}


def _chat_answer(message: str, result: InvestigationResult | None) -> str:
    """Build a plain-English answer about a payment check (streamed by /chat)."""
    if result is None:
        return ("No payment check has run yet. Pick a scenario and click "
                "‘Run investigation’, then ask me to explain it.")
    m = (message or "").lower()
    pm = result.payment_method or "card"
    pm_name = _PM_LABEL.get(pm, pm)
    conn = result.ip_connection_type or "residential"
    conn_name = ip_label(conn)
    th = result.threat_hits

    def header():
        return (f"Payment check {result.transaction_id} — **{result.decision}** "
                f"(risk {result.risk_score:.2f}).")

    # Intent routing
    if any(k in m for k in ("ip", "network", "broadband", "datacenter", "idc", "location")):
        verdict = "✓ accepted" if conn in ("residential", "business") else "✗ refused (policy: broadband only)"
        return (f"{header()} The connection is **{conn_name}** ({verdict}). "
                f"Source IP {result.ip_address if hasattr(result,'ip_address') else ''} "
                f"threat level {th.risk_level}"
                + (f"; flagged: {th.ip_reason}." if th.ip_flagged else "; no threat-feed match."))
    if any(k in m for k in ("pay", "method", "card", "apple", "google", "paypal", "wallet")):
        return (f"{header()} Paid with **{pm_name}** — {_PM_NOTE.get(pm,'')} "
                f"Card on threat list: {'yes' if th.card_flagged else 'no'}.")
    if any(k in m for k in ("why", "reason", "explain", "decision", "block", "flag", "allow")):
        sigs = "; ".join(result.key_signals[:4]) if result.key_signals else "no strong signals"
        return f"{header()} {result.reasoning} Key drivers: {sigs}."
    if any(k in m for k in ("sar", "report")):
        return result.sar_draft or "No SAR was drafted (a SAR is only generated on a BLOCK)."
    bi = result.bin_info or {}
    bin_line = (f"• BIN pre-check: {bi['note']}\n" if bi.get("available") else "")
    # Default: full digest
    return (
        f"{header()}\n"
        f"• Merchant: {result.merchant} — {fmt_money(result.amount)}\n"
        f"• Payment method: {pm_name} ({_PM_NOTE.get(pm,'')})\n"
        f"{bin_line}"
        f"• Network: {conn_name} "
        f"{'✓ accepted' if conn in ('residential','business') else '✗ refused — datacenter/IDC not allowed'}\n"
        f"• Threat intel: IP {th.risk_level}{' (flagged)' if th.ip_flagged else ''}, "
        f"card {'flagged' if th.card_flagged else 'clean'}\n"
        f"• Rule violations: {len(result.rule_violations)}\n"
        f"• Reasoning: {result.reasoning}"
    )


def fmt_money(n) -> str:
    return "—" if n is None else f"${n:,.2f}"


@api.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Stream (SSE) a plain-English answer about a payment check."""
    _require_auth(request)
    result = None
    if req.transaction_id:
        result = next((r for r in reversed(_results) if r.transaction_id == req.transaction_id), None)
    if result is None and _results:
        result = _results[-1]
    answer = _chat_answer(req.message, result)

    async def gen():
        # Stream word-by-word so the widget renders a live typing effect.
        words = answer.split(" ")
        for i, w in enumerate(words):
            chunk = w + (" " if i < len(words) - 1 else "")
            yield f"data: {json.dumps({'delta': chunk})}\n\n"
            await asyncio.sleep(0.018)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api.post("/simulate")
async def simulate(req: SimulateRequest, request: Request):
    """Fire a batch of investigations server-side (stress test + drift demo)."""
    _require_auth(request)
    from data.mock_transactions import make_transaction, make_random_transaction, SCENARIOS
    n = max(1, min(req.count, 100))
    ok, msg = _rate_ok(_client_ip(request.headers,
                                  request.client.host if request.client else "anon"), cost=n)
    if not ok:
        raise HTTPException(status_code=429, detail=msg)
    summary = {"ALLOW": 0, "FLAG": 0, "BLOCK": 0}
    for _ in range(n):
        if req.scenario == "random" or req.scenario not in SCENARIOS:
            tx = make_random_transaction()
            label = "random"
        else:
            tx = make_transaction(req.scenario)
            label = req.scenario
        res = await run_investigation(tx, scenario=label)
        summary[res.decision] = summary.get(res.decision, 0) + 1
    return {"ran": n, "summary": summary, "drift": tracer.get_drift_status()}


app.include_router(api)
app.include_router(api, prefix="/api")


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    # Auth: the dashboard appends ?token=<login token>. Reject otherwise.
    if not _valid_token(websocket.query_params.get("token")):
        await websocket.send_text(WebSocketMessage(
            type="error", payload={"message": "Please sign in to run investigations."}
        ).model_dump_json())
        await websocket.close(code=1008)
        return
    active_connections[client_id] = websocket
    console.print(f"[dim]WS connected: {client_id}[/dim]")
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "investigate":
                ip = _client_ip(websocket.headers,
                                websocket.client.host if websocket.client else "anon")
                ok, msg = _rate_ok(ip)
                if not ok:
                    await ws_send(client_id, WebSocketMessage(type="error", payload={"message": msg}))
                    continue
                tx = Transaction(**data["transaction"])
                await run_investigation(tx, client_id=client_id,
                                        scenario=data.get("scenario"))
    except WebSocketDisconnect:
        active_connections.pop(client_id, None)
        console.print(f"[dim]WS disconnected: {client_id}[/dim]")
    except Exception as e:
        active_connections.pop(client_id, None)
        console.print(f"[red]WS error: {e}[/red]")


# ── Serve the built dashboard (single-service deployment) ──────────
# `npm run build` emits dashboard/dist. When present, mount it at "/" so one
# Cloud Run service hosts both the API and the analyst UI. Mounted LAST so the
# API routes and the WebSocket above take precedence over the SPA catch-all.
_DASHBOARD_DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "dashboard", "dist",
)
if os.path.isdir(_DASHBOARD_DIST):
    app.mount("/", StaticFiles(directory=_DASHBOARD_DIST, html=True), name="dashboard")
    console.print(f"[green]✓ Serving dashboard from {_DASHBOARD_DIST}[/green]")
else:
    console.print("[dim]No dashboard/dist build found — API-only mode[/dim]")


if __name__ == "__main__":
    uvicorn.run(
        "agent.orchestrator:app",
        host=os.getenv("AGENT_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENT_PORT", "8000")),
        reload=True,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
