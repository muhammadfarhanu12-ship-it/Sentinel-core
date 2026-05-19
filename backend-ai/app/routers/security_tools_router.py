from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.schemas.security_tools_schema import (
    FinancialGuardrailRequest,
    SecurityContext,
    TextSecurityRequest,
    ToolSimulationRequest,
)
from app.security.detectors.indirectInjectionDetector import detect_indirect_prompt_injection
from app.security.interceptors.tool_context_firewall import evaluate_tool_context
from app.security.policies.financialGuardrail import policy_management_service
from app.security.preprocessors.decodeLayer import generate_decoded_variants
from app.security.sandbox.indirectPromptInjectionSandbox import indirect_prompt_injection_sandbox
from app.security.scanners.logic_checker import logic_checker
from app.security.scanners.outputLeakScanner import scan_output_for_leaks
from app.security.scanners.piiScanner import redact_sensitive_output, scan_pii
from app.security.scanners.promptScanner import scan_prompt
from app.security.security_enforcement_layer import SecurityEnforcementInput, security_enforcement_layer
from app.security.telemetry.auditTrail import security_audit_trail
from app.security.telemetry.metrics import security_metrics
from app.security.monitoring.attackHistoryMonitor import attack_history_monitor
from app.security.monitoring.contextMonitor import context_monitor

router = APIRouter(tags=["security-tools"])


def _context_dict(context: SecurityContext | None) -> dict[str, Any]:
    if context is None:
        return {"source": "user_input", "trusted": True, "operation": "chat", "user_confirmed": False}
    return context.model_dump()


def _serialize_detection(finding: Any) -> dict[str, Any]:
    return {
        "detector": finding.detector,
        "label": finding.label,
        "reason": finding.reason,
        "confidence": finding.confidence,
        "severity": finding.severity.value,
        "metadata": finding.metadata,
    }


def _serialize_policy(policy: Any) -> dict[str, Any]:
    return {
        "policy_name": policy.policy_name,
        "policy_version": policy.policy_version,
        "action": policy.action.value,
        "severity": policy.severity.value,
        "score": policy.score,
        "matched_keywords": policy.matched_keywords,
        "matched_bypass_phrases": policy.matched_bypass_phrases,
        "metadata": policy.metadata,
    }


def _serialize_output_finding(finding: Any) -> dict[str, Any]:
    return {
        "finding_type": finding.finding_type,
        "value_preview": finding.value_preview,
        "confidence": finding.confidence,
        "severity": finding.severity.value,
        "action": finding.action.value,
        "masked_value": finding.masked_value,
        "metadata": finding.metadata,
    }


@router.get("/modules")
@router.get("/config/capabilities", include_in_schema=False)
async def list_security_modules(_: dict = Depends(get_current_user)):
    """Return the security modules that have frontend-safe API coverage."""
    modules = [
        {"module": "decode_layer", "endpoint": "/api/v1/security/decode", "status": "connected"},
        {"module": "indirect_prompt_injection", "endpoint": "/api/v1/security/indirect-scan", "status": "connected"},
        {"module": "prompt_scanner", "endpoint": "/api/v1/scan", "status": "connected"},
        {"module": "pii_scanner", "endpoint": "/api/v1/security/pii-scan", "status": "connected"},
        {"module": "output_leak_scanner", "endpoint": "/api/v1/security/output-leak-scan", "status": "connected"},
        {"module": "financial_guardrail", "endpoint": "/api/v1/security/financial-guardrail", "status": "connected"},
        {"module": "tool_call_interceptor", "endpoint": "/api/v1/security/tool-simulation", "status": "connected"},
        {"module": "tool_context_firewall", "endpoint": "/api/v1/security/tool-simulation", "status": "connected"},
        {"module": "response_logic_checker", "endpoint": "/api/v1/security/logic-check", "status": "connected"},
        {"module": "sentinel_capabilities", "endpoint": "/api/v1/security/modules", "status": "connected"},
        {"module": "audit_trail", "endpoint": "/api/v1/security/audit-trail", "status": "connected"},
        {"module": "metrics", "endpoint": "/api/v1/security/metrics", "status": "connected"},
        {"module": "attack_history_monitor", "endpoint": "/api/v1/security/attack-history/{session_id}", "status": "connected"},
        {"module": "context_monitor", "endpoint": "/api/v1/security/context/{session_id}", "status": "connected"},
        {
            "module": "security_logger",
            "endpoint": None,
            "status": "backend_only",
            "reason": "writes structured server logs; read access is provided through audit/metrics endpoints to avoid exposing raw log sinks",
        },
    ]
    return ok({"modules": modules})


@router.post("/decode")
async def decode_payload(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Expose normalized and decoded variants without executing downstream tools."""
    return ok(generate_decoded_variants(payload.content(), max_depth=3))


@router.post("/indirect-scan")
async def indirect_scan(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Run the indirect prompt-injection scanner with decoded variant visibility."""
    result = scan_prompt(payload.content(), context=_context_dict(payload.context))
    return ok(result)


@router.post("/prompt-scan")
@router.post("/scan", include_in_schema=False)
async def prompt_scan(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Compatibility endpoint for direct prompt security scans."""
    result = scan_prompt(payload.content(), context=_context_dict(payload.context))
    return ok(result)


@router.post("/pii-scan")
async def pii_scan(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Detect input PII and return safe previews plus redacted text."""
    findings = scan_pii(payload.content())
    redaction = redact_sensitive_output(payload.content())
    highest = "LOW"
    for finding in findings:
        if finding.severity.value == "CRITICAL":
            highest = "CRITICAL"
            break
        if finding.severity.value == "HIGH":
            highest = "HIGH"
        elif finding.severity.value == "MEDIUM" and highest == "LOW":
            highest = "MEDIUM"
    return ok(
        {
            "contains_pii": bool(findings),
            "severity": highest,
            "findings": [_serialize_detection(finding) for finding in findings],
            "detected_pii_types": sorted({finding.label.replace("pii_", "") for finding in findings}),
            "redacted_text": redaction.get("redacted_output", payload.content()),
            "redaction_events": redaction.get("redaction_events", []),
            "recommended_action": "Redact or block before model/tool use." if findings else "Allow.",
        }
    )


@router.post("/output-leak-scan")
async def output_leak_scan(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Scan model output for secrets, credentials, and sensitive financial data."""
    redacted, findings, action = scan_output_for_leaks(payload.content())
    return ok(
        {
            "verdict": "block" if action.value == "BLOCK" else "warn" if findings else "allow",
            "action": action.value,
            "leak_risk": action.value,
            "findings": [_serialize_output_finding(finding) for finding in findings],
            "sensitive_data_categories": sorted({finding.finding_type for finding in findings}),
            "redacted_output": redacted,
            "recommended_action": "Block or redact output before returning to the user." if findings else "Allow.",
        }
    )


@router.post("/logic-check")
async def response_logic_check(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Verify an AI response against configured financial business rules."""
    result = logic_checker.verify_response(payload.content(), context=_context_dict(payload.context))
    return ok(result.model_dump())


@router.post("/financial-guardrail")
@router.post("/financial-guardrail/check", include_in_schema=False)
async def financial_guardrail_check(
    payload: FinancialGuardrailRequest,
    current_user: dict = Depends(get_current_user),
):
    """Evaluate financial, crypto, wallet, and payment instructions with 2FA policy context."""
    context = _context_dict(payload.context)
    if payload.user_confirmed is not None:
        context["user_confirmed"] = bool(payload.user_confirmed)
    enforcement = security_enforcement_layer.pre_model_enforce(
        SecurityEnforcementInput(
            prompt=payload.content(),
            tool_name="transfer_funds" if context.get("operation") == "financial_action" else None,
            two_factor_code=payload.two_factor_code,
            user_id=str(current_user.get("id") or current_user.get("_id") or ""),
            metadata={"context": context},
        )
    )
    return ok(
        {
            "verdict": "block" if enforcement.action.value in {"BLOCK", "FORCE_REVIEW", "INTERCEPT_AND_FORCE_2FA"} else "allow",
            "action": enforcement.action.value,
            "risk_score": enforcement.risk_score,
            "risk_level": enforcement.severity.value.lower(),
            "requires_2fa": enforcement.requires_2fa,
            "review_required": enforcement.review_required,
            "detections": [_serialize_detection(finding) for finding in enforcement.detections],
            "policy_matches": [_serialize_policy(policy) for policy in enforcement.policy_matches],
            "tool_interception": enforcement.tool_interception,
            "explanation": enforcement.explanation,
            "recommended_action": "Block untrusted or decoded financial execution; require explicit confirmation and 2FA for real user requests.",
        }
    )


@router.post("/tool-simulation")
@router.post("/tool-call/simulate", include_in_schema=False)
async def tool_call_simulation(
    payload: ToolSimulationRequest,
    current_user: dict = Depends(get_current_user),
):
    """Safely simulate tool interception without invoking the requested tool."""
    context = _context_dict(payload.context)
    enforcement = security_enforcement_layer.pre_model_enforce(
        SecurityEnforcementInput(
            prompt=payload.content(),
            tool_name=payload.tool_name,
            tool_args=payload.tool_args,
            two_factor_code=payload.two_factor_code,
            user_id=str(current_user.get("id") or current_user.get("_id") or ""),
            metadata={"context": context, "simulation": True},
        )
    )
    firewall = evaluate_tool_context(
        tool_name=payload.tool_name,
        prompt=payload.content(),
        detector_flagged=bool(enforcement.detections),
        intent_score=max((float(hit.confidence) for hit in enforcement.detections), default=0.0),
    )
    return ok(
        {
            "tool_name": payload.tool_name,
            "simulated": True,
            "allowed": enforcement.action.value == "ALLOW" and bool(enforcement.tool_interception.get("approved", True)),
            "action": enforcement.action.value,
            "risk_score": enforcement.risk_score,
            "risk_level": enforcement.severity.value.lower(),
            "requires_2fa": enforcement.requires_2fa,
            "review_required": enforcement.review_required,
            "tool_interception": enforcement.tool_interception,
            "tool_context_firewall": {
                "allowed": firewall.allowed,
                "reason": firewall.reason,
                "risk_score": firewall.risk_score,
            },
            "detections": [_serialize_detection(finding) for finding in enforcement.detections],
            "recommended_action": "Do not execute blocked or review-required tools from untrusted content.",
        }
    )


@router.get("/metrics")
async def security_metrics_snapshot(_: dict = Depends(get_current_user)):
    """Read frontend-safe in-memory security metrics."""
    return ok(security_metrics.snapshot())


@router.get("/audit-trail")
async def security_audit_trail_events(
    limit: int = Query(default=100, ge=1, le=500),
    session_id: str | None = Query(default=None, max_length=128),
    correlation_id: str | None = Query(default=None, max_length=128),
    _: dict = Depends(get_current_user),
):
    """Read recent in-memory security audit events."""
    if correlation_id:
        events = security_audit_trail.search_by_correlation(correlation_id)
    elif session_id:
        events = security_audit_trail.search_by_session(session_id)
    else:
        events = security_audit_trail.latest(limit)
    return ok({"events": events[-limit:]})


@router.get("/attack-history/{session_id}")
async def attack_history(session_id: str, _: dict = Depends(get_current_user)):
    """Return attack-history monitor state for a session."""
    return ok(attack_history_monitor.session_summary(session_id))


@router.get("/context/{session_id}")
async def context_summary(session_id: str, _: dict = Depends(get_current_user)):
    """Return context/audit risk summary for a session."""
    return ok(
        {
            "audit_risk": security_audit_trail.risk_summary(session_id),
            "attack_history": attack_history_monitor.session_summary(session_id),
            "monitor_enabled": context_monitor.enabled,
        }
    )


@router.post("/sandbox/wrap")
async def sandbox_wrap(payload: TextSecurityRequest, _: dict = Depends(get_current_user)):
    """Wrap untrusted content so it cannot become trusted model/tool instructions."""
    return ok(indirect_prompt_injection_sandbox.wrap_untrusted_content(payload.content()))
