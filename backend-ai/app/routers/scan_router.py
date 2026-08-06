from __future__ import annotations

import asyncio
import inspect
import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator
from fastapi import APIRouter, Depends, Request

from app.core.config import settings
from app.core.tier import normalize_tier, requested_scan_tier, require_scan_entitlement
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import check_rate_limit
from app.schemas.api_schema import ok
from app.services.dashboard_service import ensure_datetime, load_workspace_logs, persist_scan_result, tier_for, utcnow
from app.services.security_service import scan_prompt_with_resilience

router = APIRouter(tags=["scan"])
logger = logging.getLogger(__name__)

TOOL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
SECURITY_TIER_FEATURES: dict[str, list[str]] = {
    "free": [
        "prompt_injection_detection",
        "suspicious_pattern_detection",
        "pii_scan",
        "basic_risk_scoring",
    ],
    "pro": [
        "prompt_injection_detection",
        "suspicious_pattern_detection",
        "pii_scan",
        "indirect_injection_detection",
        "encoded_payload_detection",
        "decode_layer",
        "unicode_obfuscation_detection",
        "matched_signals",
        "decoded_variants",
        "advanced_risk_scoring",
        "wallet_crypto_tool_attack_detection",
    ],
    "business": [
        "prompt_injection_detection",
        "suspicious_pattern_detection",
        "pii_scan",
        "indirect_injection_detection",
        "encoded_payload_detection",
        "decode_layer",
        "unicode_obfuscation_detection",
        "matched_signals",
        "decoded_variants",
        "advanced_risk_scoring",
        "wallet_crypto_tool_attack_detection",
        "financial_guardrails",
        "tool_call_interceptor",
        "tool_context_firewall",
        "human_review",
        "mfa_2fa_enforcement",
        "audit_logging",
        "security_logs",
        "metrics_telemetry",
        "enterprise_policy_enforcement",
    ],
}


class ToolCallPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    args: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("tool_call.name is required")
        if not TOOL_NAME_PATTERN.fullmatch(normalized):
            raise ValueError("tool_call.name contains invalid characters")
        return normalized

    @field_validator("args")
    @classmethod
    def validate_args(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            serialized = json.dumps(value or {}, default=str)
        except Exception as exc:
            raise ValueError("tool_call.args must be JSON serializable") from exc
        if len(serialized) > 20_000:
            raise ValueError("tool_call.args exceeds maximum allowed size")
        return value or {}


class ScanRequest(BaseModel):
    prompt: str | None = Field(default=None, min_length=1)
    text: str | None = Field(default=None, min_length=1)
    provider: str = Field(default="gemini", max_length=64)
    model: str = Field(default="gemini-1.5-flash", max_length=128)
    securityTier: str | None = Field(default=None, max_length=32)
    security_tier: str | None = Field(default=None, max_length=32)
    session_id: str | None = Field(default=None, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    conversation_id: str | None = Field(default=None, max_length=128)
    conversation_history: list[str] | None = Field(default=None)
    untrusted_content: str | None = Field(default=None, max_length=12000)
    tool_call: ToolCallPayload | None = Field(default=None)
    tool_2fa_code: str | None = Field(default=None, max_length=32)
    context: dict[str, Any] | None = Field(default=None)
    metadata: dict[str, Any] | None = Field(default=None)

    @model_validator(mode="after")
    def validate_prompt_or_text(self) -> "ScanRequest":
        if not str(self.prompt or self.text or "").strip():
            raise ValueError("prompt or text is required")
        if self.prompt is None and self.text is not None:
            self.prompt = self.text
        return self

    @field_validator("conversation_history")
    @classmethod
    def validate_conversation_history(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        sanitized: list[str] = []
        for item in value[:30]:
            normalized = str(item or "").strip()
            if not normalized:
                continue
            sanitized.append(normalized[:4000])
        return sanitized

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        try:
            serialized = json.dumps(value, default=str)
        except Exception as exc:
            raise ValueError("metadata must be JSON serializable") from exc
        if len(serialized) > 20_000:
            raise ValueError("metadata exceeds maximum allowed size")
        return value

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        allowed_sources = {"user_input", "external_content", "webpage", "email", "social_post", "document", "tool_output"}
        allowed_operations = {"chat", "tool_call", "financial_action", "code_execution", "data_access"}
        source = value.get("source")
        operation = value.get("operation")
        if source is not None and str(source) not in allowed_sources:
            raise ValueError("context.source is not supported")
        if operation is not None and str(operation) not in allowed_operations:
            raise ValueError("context.operation is not supported")
        return value


def _build_security_state(result: dict[str, Any]) -> dict[str, Any]:
    status = str(result.get("status") or "").upper()
    requires_2fa = bool(result.get("requires_2fa"))
    review_required = bool(result.get("review_required"))
    risk_score = _normalize_score_100(result.get("risk_score"), result.get("threat_score"))
    suspicious_activity = bool(status in {"BLOCKED", "REDACTED"} or review_required or risk_score >= 70)

    code = "none"
    message = "Request passed security checks."
    if status == "BLOCKED" and requires_2fa:
        code = "mfa_required"
        message = "MFA verification is required before this operation can continue."
    elif status == "BLOCKED":
        code = "blocked_request"
        message = "The request was blocked by Mefyx Gateway security policies."
    elif suspicious_activity:
        code = "suspicious_activity"
        message = "Suspicious activity detected. The request was sanitized or flagged for review."

    return {
        "code": code,
        "message": message,
        "blocked_request": status == "BLOCKED",
        "mfa_required": status == "BLOCKED" and requires_2fa,
        "suspicious_activity_detected": suspicious_activity,
        "review_required": review_required,
        "requires_2fa": requires_2fa,
        "verification_required": False,
        "insufficient_permissions": False,
        "session_expired": False,
    }


def _normalize_score_100(*values: Any) -> int:
    candidates: list[float] = []
    for value in values:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if parsed <= 1:
            parsed *= 100
        candidates.append(parsed)
    return int(round(max(0.0, min(100.0, max(candidates or [0.0])))))


def _normalize_score_01(*values: Any) -> float:
    return round(_normalize_score_100(*values) / 100.0, 4)


def _normalize_security_tier(*values: Any) -> str:
    for value in values:
        normalized = str(value or "").strip().lower()
        if normalized in SECURITY_TIER_FEATURES:
            return normalized
    return "pro"


async def _enforce_runtime_tier_limits(
    *,
    request: Request,
    current_user: dict[str, Any],
    requested_tier: str,
    provider: str,
    model: str,
    prompt: str,
):
    active_tier = normalize_tier(tier_for(current_user))
    limits = require_scan_entitlement(
        active_tier=active_tier,
        requested_tier=requested_tier,
        provider=provider,
        model=model,
        prompt=prompt,
    )

    identifier = str(current_user.get("id") or current_user.get("_id") or current_user.get("email") or "anonymous")
    check_rate_limit(identifier, "scan", limits.requests_per_minute, 60)

    month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    logs = await load_workspace_logs(request, current_user, max_items=limits.monthly_requests + 1)
    monthly_count = sum(1 for log in logs if ensure_datetime(log.get("timestamp")) >= month_start)
    if monthly_count >= limits.monthly_requests:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "Monthly request quota exceeded for the active plan.",
                "tier": limits.name,
                "used": monthly_count,
                "limit": limits.monthly_requests,
            },
        )
    return limits


async def _persist_scan_log_sync(
    *,
    request: Request,
    current_user: dict[str, Any],
    prompt: str,
    provider: str,
    model: str,
    security_tier: str,
    scan_result: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    return await persist_scan_result(
        request,
        current_user,
        prompt=prompt,
        provider=provider,
        model=model,
        security_tier=security_tier,
        scan_result=scan_result,
        runtime=runtime,
    )


async def _persist_scan_log_with_compatibility(**kwargs: Any) -> dict[str, Any]:
    if inspect.iscoroutinefunction(_persist_scan_log_sync):
        return await _persist_scan_log_sync(**kwargs)
    return await asyncio.to_thread(_persist_scan_log_sync, **kwargs)


@router.post("")
async def scan_prompt(payload: ScanRequest, request: Request, current_user: dict = Depends(get_current_user)):
    active_tier = normalize_tier(tier_for(current_user))
    requested_tier_upper, _client_supplied_tier = requested_scan_tier(
        payload.security_tier,
        payload.securityTier,
        active_tier=active_tier,
    )
    security_tier = requested_tier_upper.lower()
    internal_security_tier = security_tier.upper()
    enabled_features = list(SECURITY_TIER_FEATURES[security_tier])
    tool_call = payload.tool_call
    prompt_text = str(payload.prompt or payload.text or "")
    await _enforce_runtime_tier_limits(
        request=request,
        current_user=current_user,
        requested_tier=internal_security_tier,
        provider=payload.provider,
        model=payload.model,
        prompt=prompt_text,
    )

    request_metadata = dict(payload.metadata or {})
    if payload.context is not None:
        request_metadata["context"] = payload.context
    if payload.request_id:
        request_metadata["request_id"] = payload.request_id

    result, runtime = await scan_prompt_with_resilience(
        prompt_text,
        provider=payload.provider,
        model=payload.model,
        security_tier=internal_security_tier,
        session_id=payload.session_id,
        conversation_id=payload.conversation_id,
        conversation_history=payload.conversation_history,
        untrusted_content=payload.untrusted_content,
        tool_name=tool_call.name if tool_call else None,
        tool_args=tool_call.args if tool_call else None,
        two_factor_code=payload.tool_2fa_code,
        user_id=str(current_user.get("id") or current_user.get("_id") or ""),
        metadata=request_metadata,
    )
    normalized_risk_score = _normalize_score_100(result.get("risk_score"), result.get("threat_score"))
    normalized_threat_score = _normalize_score_01(result.get("threat_score"), result.get("risk_score"))
    result["risk_score"] = normalized_risk_score
    result["threat_score"] = normalized_threat_score
    result["security_tier"] = security_tier
    result["enabled_features"] = enabled_features
    if isinstance(result.get("sentinel_verdict"), dict):
        result["sentinel_verdict"]["threat_score"] = _normalize_score_01(
            result["sentinel_verdict"].get("threat_score"),
            normalized_risk_score,
        )
        result["sentinel_verdict"]["security_tier"] = internal_security_tier
    runtime.setdefault("logging_deferred", False)
    security_state = _build_security_state(result)
    verdict = dict(result.get("sentinel_verdict") or {})
    enforcement_payload = result.get("security_enforcement") if isinstance(result.get("security_enforcement"), dict) else {}
    enforcement_context = enforcement_payload.get("context_summary") if isinstance(enforcement_payload.get("context_summary"), dict) else {}
    enforcement_telemetry = enforcement_payload.get("telemetry") if isinstance(enforcement_payload.get("telemetry"), dict) else {}
    authoritative_execution = {
        "provider": str(result.get("provider") or verdict.get("provider") or payload.provider),
        "model": str(result.get("model") or verdict.get("model") or payload.model),
        "security_tier": security_tier,
        "enabled_features": enabled_features,
        "status": str(result.get("status") or ""),
        "threat_score": _normalize_score_01(result.get("threat_score"), result.get("risk_score"), verdict.get("threat_score")),
        "risk_score": _normalize_score_100(result.get("risk_score"), result.get("threat_score"), verdict.get("threat_score")),
        "verdict_category": str(verdict.get("category") or "Unknown"),
        "execution_output": str(verdict.get("execution_output") or ""),
        "detail": str(verdict.get("detail") or ""),
    }

    response_data = {
        **result,
        "security_tier": security_tier,
        "enabled_features": enabled_features,
        "execution": authoritative_execution,
        "security_state": security_state,
        "context_analysis": result.get("context_analysis") or enforcement_context.get("stateful_context_analysis") or {},
        "anonymization": result.get("anonymization") or enforcement_telemetry.get("anonymization") or {
            "original_contains_pii": False,
            "pii_counts": {},
        },
        "prompt_scan": result.get("prompt_scan") or {
            "verdict": result.get("verdict"),
            "risk_score": result.get("risk_score"),
            "risk_level": result.get("risk_level"),
            "detected_categories": result.get("detected_categories") or [],
            "matched_signals": result.get("matched_signals") or [],
        },
        "logic_check": result.get("logic_check") or enforcement_telemetry.get("response_logic_check") or {},
        "response": result.get("response") or verdict.get("execution_output") or "",
        "security_report": {
            "threat_type": result.get("threat_type"),
            "action_taken": (
                "Blocked malicious or unsafe request. Human review required."
                if result.get("status") == "BLOCKED"
                and authoritative_execution.get("verdict_category") == "HITL_BYPASS_ATTEMPT"
                else "Blocked malicious or unsafe request."
                if result.get("status") == "BLOCKED"
                else "Redacted sensitive content before downstream processing."
                if result.get("status") == "REDACTED"
                else "Allowed request to proceed."
            ),
            "detection_reason": result.get("explanation"),
        },
        "analysis": {
            "reasoning": result.get("explanation"),
            "downstream_analysis": None
            if result.get("status") != "CLEAN"
            else {
                "status": "approved",
                "provider": authoritative_execution["provider"],
                "model": authoritative_execution["model"],
            },
            "scan_runtime": runtime,
        },
    }

    request_id = getattr(request.state, "request_id", None) or None
    persist_task = asyncio.create_task(
        _persist_scan_log_with_compatibility(
            request=request,
            current_user=current_user,
            prompt=prompt_text,
            provider=payload.provider,
            model=payload.model,
            security_tier=security_tier,
            scan_result=result,
            runtime=runtime,
        )
    )
    try:
        sync_budget = max(0.01, float(getattr(settings, "SCAN_SYNC_LOG_BUDGET_SECONDS", 0.25) or 0.25))
        persisted_log = await asyncio.wait_for(asyncio.shield(persist_task), timeout=sync_budget)
    except asyncio.TimeoutError:
        runtime["logging_deferred"] = True
        persisted_log = {"request_id": request_id}

        def _report_persist_failure(task: asyncio.Task[dict[str, Any]]) -> None:
            try:
                task.result()
            except Exception:
                logger.exception("Deferred scan log persistence failed request_id=%s", request_id)

        persist_task.add_done_callback(_report_persist_failure)
    except Exception:
        logger.exception("Scan log persistence failed request_id=%s", request_id)
        persisted_log = {"request_id": request_id}

    response_data["request_id"] = persisted_log.get("request_id")
    return ok(response_data)
