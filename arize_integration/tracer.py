"""
Arize AI integration layer — the partner integration at the heart of this
hackathon submission.

Provides four capabilities:
  1. Distributed tracing — every tool call and Gemini completion is exported
     to Arize as an OpenTelemetry / OpenInference span (the same protocol the
     Arize MCP server reads), giving a full per-investigation trace tree.
  2. Span logging      — an in-memory mirror of every span so the dashboard
     can render the trace live without a round-trip to Arize.
  3. Drift monitor     — PSI-based alert on the risk-score distribution.
  4. Prompt quality    — heuristic LLM-as-judge evaluation of SAR drafts.

When ARIZE_API_KEY / ARIZE_SPACE_ID are not set, the OpenTelemetry export is
skipped and everything runs locally, so the system works fully in demo mode
without an Arize account.
"""
from __future__ import annotations
import os
import time
import json
import math
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from rich.console import Console

console = Console()

ARIZE_API_KEY  = os.getenv("ARIZE_API_KEY", "")
ARIZE_SPACE_ID = os.getenv("ARIZE_SPACE_ID", "")
ARIZE_MODEL_ID = os.getenv("ARIZE_MODEL_ID", "fraudsentinel-v1")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

_arize_enabled = bool(
    ARIZE_API_KEY and ARIZE_API_KEY != "your-arize-api-key"
    and ARIZE_SPACE_ID and ARIZE_SPACE_ID != "your-arize-space-id"
)


class SpanRecord:
    """In-memory span log (mirrors what is exported to Arize)."""
    def __init__(self):
        self.spans: list[dict] = []

    def add(self, span: dict):
        self.spans.append(span)
        # Keep last 500 spans in memory
        if len(self.spans) > 500:
            self.spans.pop(0)


_span_log = SpanRecord()

# PSI drift monitor state
_score_window: list[float] = []          # rolling window of recent risk scores
_baseline_scores: list[float] = []       # initial distribution (first 50 scores)
_PSI_THRESHOLD = 0.2


def _psi(expected: list[float], actual: list[float], bins: int = 10) -> float:
    """Population Stability Index — measures distribution shift."""
    if len(expected) < 10 or len(actual) < 10:
        return 0.0
    min_v = min(min(expected), min(actual))
    max_v = max(max(expected), max(actual)) + 1e-9
    edges = [min_v + i * (max_v - min_v) / bins for i in range(bins + 1)]

    def bucket(vals):
        counts = [0] * bins
        for v in vals:
            idx = min(int((v - min_v) / (max_v - min_v) * bins), bins - 1)
            counts[idx] += 1
        total = max(sum(counts), 1)
        return [max(c / total, 1e-4) for c in counts]

    e = bucket(expected)
    a = bucket(actual)
    return sum((ai - ei) * math.log(ai / ei) for ei, ai in zip(e, a))


class ArizeTracer:
    """Facade for all Arize observability operations."""

    def __init__(self):
        self._otel_tracer = None
        self._provider = None
        if _arize_enabled:
            self._init_otel()
        else:
            console.print("[dim]Arize not configured — spans logged locally only[/dim]")

    def flush(self):
        """Force-export any buffered spans (call on shutdown so Cloud Run /
        short-lived processes don't drop traces)."""
        if self._provider is not None:
            try:
                self._provider.force_flush()
            except Exception:
                pass

    # ── OpenTelemetry / OpenInference export to Arize ─────────────

    def _init_otel(self):
        """
        Register an OpenTelemetry tracer that exports OpenInference spans to
        Arize. This is the modern, MCP-compatible tracing path: traces written
        here are queryable from the Arize platform and the Arize MCP server.
        """
        try:
            from arize.otel import register
            tracer_provider = register(
                space_id=ARIZE_SPACE_ID,
                api_key=ARIZE_API_KEY,
                project_name=ARIZE_MODEL_ID,
            )
            from opentelemetry import trace
            self._provider = tracer_provider
            self._otel_tracer = trace.get_tracer("fraudsentinel")
            console.print("[green]✓ Arize OpenTelemetry tracing enabled[/green]")
        except Exception as e:
            console.print(f"[yellow]Arize OTel init error: {e} — local-only mode[/yellow]")
            self._otel_tracer = None

    @contextmanager
    def _otel_span(self, name: str, kind: str, inputs: Any, outputs: Any,
                   extra: dict | None = None):
        """
        Emit one OpenInference span to Arize. `kind` is one of CHAIN, TOOL, LLM.
        No-op (but still yields) when Arize is not connected.
        """
        if self._otel_tracer is None:
            yield None
            return
        try:
            from openinference.semconv.trace import SpanAttributes
            with self._otel_tracer.start_as_current_span(name) as span:
                span.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, kind)
                span.set_attribute(SpanAttributes.INPUT_VALUE, _as_text(inputs))
                span.set_attribute(SpanAttributes.OUTPUT_VALUE, _as_text(outputs))
                for k, v in (extra or {}).items():
                    span.set_attribute(k, v)
                yield span
        except Exception as e:
            console.print(f"[dim]Arize span error: {e}[/dim]")
            yield None

    # ── Span logging ──────────────────────────────────────────────

    def log_span(self, tool_name: str, inputs: Any, outputs: Any, trace_id: str):
        span = {
            "type": "tool_span",
            "tool": tool_name,
            "trace_id": trace_id,
            "inputs": inputs,
            "outputs": outputs,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _span_log.add(span)
        with self._otel_span(tool_name, "TOOL", inputs, outputs,
                             {"fraudsentinel.trace_id": trace_id}):
            pass

    def log_llm_span(
        self,
        span_name: str,
        system_prompt: str,
        user_prompt: str,
        response: str,
        trace_id: str,
    ):
        span = {
            "type": "llm_span",
            "name": span_name,
            "trace_id": trace_id,
            "system_prompt": system_prompt[:500],    # truncate for display
            "user_prompt": user_prompt[:1000],
            "response": response[:2000],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": GEMINI_MODEL,
        }
        _span_log.add(span)
        try:
            from openinference.semconv.trace import SpanAttributes
            model_attr = {SpanAttributes.LLM_MODEL_NAME: GEMINI_MODEL,
                          "fraudsentinel.trace_id": trace_id}
        except Exception:
            model_attr = {"fraudsentinel.trace_id": trace_id}
        with self._otel_span(span_name, "LLM",
                             f"{system_prompt}\n\n{user_prompt}", response,
                             model_attr):
            pass

    def log_investigation(self, result):
        """Log the final investigation result for model monitoring."""
        from agent.models import InvestigationResult
        score = result.risk_score

        # Update rolling window for drift detection
        _score_window.append(score)
        if len(_score_window) > 200:
            _score_window.pop(0)

        if len(_baseline_scores) < 50:
            _baseline_scores.append(score)

        # Check for drift
        if len(_baseline_scores) >= 50 and len(_score_window) >= 20:
            psi = _psi(_baseline_scores, _score_window[-50:])
            if psi > _PSI_THRESHOLD:
                console.print(
                    f"[bold red]⚠  ARIZE DRIFT ALERT — PSI={psi:.3f} > {_PSI_THRESHOLD}[/bold red]"
                )
                _span_log.add({
                    "type": "drift_alert",
                    "psi": psi,
                    "threshold": _PSI_THRESHOLD,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

        span = {
            "type": "investigation_result",
            "transaction_id": result.transaction_id,
            "decision": result.decision,
            "risk_score": score,
            "processing_ms": result.processing_ms,
            "violation_count": len(result.rule_violations),
            "trace_id": result.trace_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _span_log.add(span)
        with self._otel_span(
            "investigation", "CHAIN",
            {"transaction_id": result.transaction_id},
            {"decision": result.decision, "risk_score": score},
            {"fraudsentinel.decision": result.decision,
             "fraudsentinel.risk_score": score,
             "fraudsentinel.processing_ms": result.processing_ms,
             "fraudsentinel.trace_id": result.trace_id or ""},
        ):
            pass

    def log_prompt_quality(self, sar_text: str, trace_id: str):
        """
        Evaluate SAR draft quality on three dimensions.
        Uses simple heuristics locally; in production Arize runs LLM-as-judge
        evaluations against these same spans.
        """
        word_count = len(sar_text.split())
        completeness = min(word_count / 250, 1.0)      # target ~250 words
        coherence = 0.9 if len(sar_text) > 100 else 0.5
        factual_grounding = 0.85                        # placeholder

        quality_span = {
            "type": "prompt_quality",
            "trace_id": trace_id,
            "completeness": round(completeness, 3),
            "coherence": round(coherence, 3),
            "factual_grounding": round(factual_grounding, 3),
            "word_count": word_count,
            "flagged_for_review": completeness < 0.75 or coherence < 0.75,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _span_log.add(quality_span)

        with self._otel_span(
            "sar_quality_eval", "EVALUATOR",
            {"word_count": word_count}, quality_span,
            {"fraudsentinel.completeness": completeness,
             "fraudsentinel.coherence": coherence,
             "fraudsentinel.trace_id": trace_id},
        ):
            pass

        if quality_span["flagged_for_review"]:
            console.print("[yellow]⚠  SAR quality below threshold — flagged for human review[/yellow]")

    def log_feedback(self, transaction_id: str, agent_decision: str,
                     analyst_decision: str, note: str, trace_id: str | None):
        """
        Record a human-in-the-loop override as an Arize annotation span.
        Agreement between agent and analyst becomes a ground-truth label that
        Arize uses to track the agent's decision accuracy over time.
        """
        agreed = agent_decision == analyst_decision
        span = {
            "type": "analyst_feedback",
            "transaction_id": transaction_id,
            "agent_decision": agent_decision,
            "analyst_decision": analyst_decision,
            "agreed": agreed,
            "note": note,
            "trace_id": trace_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _span_log.add(span)
        with self._otel_span(
            "analyst_feedback", "EVALUATOR",
            {"agent_decision": agent_decision},
            {"analyst_decision": analyst_decision, "agreed": agreed, "note": note},
            {"fraudsentinel.agreed": agreed,
             "fraudsentinel.analyst_decision": analyst_decision,
             "fraudsentinel.trace_id": trace_id or ""},
        ):
            pass
        if not agreed:
            console.print(f"[yellow]⚠  Analyst overrode agent: {agent_decision} → {analyst_decision}[/yellow]")

    # ── Drift monitor setup ───────────────────────────────────────

    def setup_drift_monitor(self):
        """Initialise the PSI drift monitor state."""
        _score_window.clear()
        _baseline_scores.clear()
        console.print(f"[dim]Drift monitor: PSI threshold={_PSI_THRESHOLD}[/dim]")

    # ── Data access for dashboard API ────────────────────────────

    @staticmethod
    def get_recent_spans(limit: int = 50) -> list[dict]:
        return _span_log.spans[-limit:]

    @staticmethod
    def get_drift_status() -> dict:
        if len(_baseline_scores) < 50 or len(_score_window) < 20:
            return {"psi": 0.0, "status": "calibrating",
                    "baseline_count": len(_baseline_scores),
                    "window_count": len(_score_window)}
        psi = _psi(_baseline_scores, _score_window[-50:])
        return {
            "psi": round(psi, 4),
            "threshold": _PSI_THRESHOLD,
            "status": "alert" if psi > _PSI_THRESHOLD else "ok",
            "baseline_count": len(_baseline_scores),
            "window_count": len(_score_window),
            "recent_scores": _score_window[-20:],
        }


def _as_text(value: Any) -> str:
    """Coerce arbitrary span payloads to a string for OpenInference attributes."""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)[:4000]
    except Exception:
        return str(value)[:4000]
