from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.core.tier import normalize_tier, require_scan_entitlement
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import check_rate_limit
from app.schemas.api_schema import fail, ok
from app.schemas.gateway_schema import GatewayChatRequest, GatewayChatResponse, GatewaySecurity, GatewayUsage
from app.security.redaction_engine import redact_sensitive_data
from app.services.ai_providers import ProviderConfigurationError, ProviderFailure, get_provider
from app.services.ai_providers.base import estimate_messages_tokens
from app.services.dashboard_service import tier_for, utcnow
from app.services.gateway_service import (
    count_gateway_usage_since,
    record_gateway_audit,
    record_gateway_usage,
)
from app.services.security_service import scan_prompt_with_resilience

router = APIRouter(tags=["gateway"])


def _messages_to_prompt(payload: GatewayChatRequest) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in payload.messages or [])


def _policy_names(scan_result: dict[str, Any]) -> list[str]:
    enforcement = scan_result.get("security_enforcement") if isinstance(scan_result.get("security_enforcement"), dict) else {}
    return [
        str(policy.get("policy_name"))
        for policy in enforcement.get("policy_matches") or []
        if isinstance(policy, dict) and str(policy.get("policy_name") or "").strip()
    ]


def _error_response(*, status_code: int, code: str, message: str, request_id: str, details: Any | None = None) -> JSONResponse:
    payload_details = {"request_id": request_id, **(details if isinstance(details, dict) else {})}
    body = fail(code=code, message=message, details=payload_details).model_dump(mode="json")
    if body.get("error"):
        body["error"]["request_id"] = request_id
    return JSONResponse(status_code=status_code, content=body)


async def _enforce_gateway_tier(
    *,
    request: Request,
    current_user: dict[str, Any],
    provider: str,
    model: str,
    prompt: str,
    request_id: str,
):
    active_tier = normalize_tier(tier_for(current_user))
    try:
        limits = require_scan_entitlement(
            active_tier=active_tier,
            requested_tier=active_tier,
            provider=provider,
            model=model,
            prompt=prompt,
        )
    except HTTPException as exc:
        action = "gateway_model_denied" if exc.status_code == status.HTTP_403_FORBIDDEN else "gateway_quota_exceeded"
        await record_gateway_audit(
            request,
            current_user,
            action=action,
            provider=provider,
            model=model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="WARNING",
        )
        raise

    identifier = str(current_user.get("id") or current_user.get("_id") or current_user.get("email") or "anonymous")
    try:
        check_rate_limit(identifier, "gateway_chat", limits.requests_per_minute, 60)
    except HTTPException:
        await record_gateway_audit(
            request,
            current_user,
            action="gateway_quota_exceeded",
            provider=provider,
            model=model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="WARNING",
            metadata={"limit_type": "rate"},
        )
        raise

    month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = await count_gateway_usage_since(request, current_user, month_start)
    if used >= limits.monthly_requests:
        await record_gateway_audit(
            request,
            current_user,
            action="gateway_quota_exceeded",
            provider=provider,
            model=model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="WARNING",
            metadata={"limit_type": "monthly", "used": used, "limit": limits.monthly_requests},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Monthly gateway quota exceeded.", "used": used, "limit": limits.monthly_requests},
        )
    return limits


@router.post("/chat")
async def gateway_chat(payload: GatewayChatRequest, request: Request, current_user: dict = Depends(get_current_user)):
    request_id = getattr(request.state, "request_id", None) or ""
    prompt = _messages_to_prompt(payload)

    try:
        await _enforce_gateway_tier(
            request=request,
            current_user=current_user,
            provider=payload.provider,
            model=payload.model,
            prompt=prompt,
            request_id=request_id,
        )
    except HTTPException as exc:
        code = "gateway_model_denied" if exc.status_code == status.HTTP_403_FORBIDDEN else "gateway_quota_exceeded"
        message = "Requested provider/model is not available for the active plan." if code == "gateway_model_denied" else "Gateway quota exceeded."
        return _error_response(status_code=exc.status_code, code=code, message=message, request_id=request_id)

    scan_result, scan_runtime = await scan_prompt_with_resilience(
        prompt,
        provider=payload.provider,
        model=payload.model,
        security_tier=normalize_tier(tier_for(current_user)),
        session_id=str(current_user.get("id") or current_user.get("_id") or ""),
        conversation_id=str(payload.metadata.get("conversation_id")) if payload.metadata and payload.metadata.get("conversation_id") else None,
        conversation_history=[message.content for message in payload.messages or []],
        user_id=str(current_user.get("id") or current_user.get("_id") or ""),
        metadata={
            "route": "gateway_chat",
            "project": payload.project,
            "app_name": payload.app_name,
            "client_metadata": payload.metadata or {},
        },
    )
    status_value = str(scan_result.get("status") or "").upper()
    decision = str(scan_result.get("decision") or "ALLOW").lower()
    risk_score = int(scan_result.get("risk_score") or 0)
    security_payload = {
        "decision": decision,
        "risk_score": risk_score,
        "threat_type": scan_result.get("threat_type"),
        "matched_policies": _policy_names(scan_result),
        "status": status_value or "CLEAN",
    }

    if status_value in {"BLOCKED", "REDACTED"} or decision == "block":
        await record_gateway_usage(
            request,
            current_user,
            provider=payload.provider,
            model=payload.model,
            usage=GatewayUsage(input_tokens=estimate_messages_tokens(payload.messages or []), output_tokens=0, total_tokens=estimate_messages_tokens(payload.messages or []), estimated=True),
            status="blocked",
            security_decision=decision,
            request_id=request_id,
            prompt_preview=prompt,
        )
        await record_gateway_audit(
            request,
            current_user,
            action="gateway_request_blocked",
            provider=payload.provider,
            model=payload.model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="CRITICAL",
            metadata={"risk_score": risk_score, "scan_runtime": scan_runtime.get("status")},
        )
        return _error_response(
            status_code=status.HTTP_403_FORBIDDEN,
            code="policy_blocked",
            message="Request blocked by Sentinel-Core policy.",
            request_id=request_id,
            details={"security": security_payload},
        )

    try:
        provider = get_provider(payload.provider)
        provider_response = await provider.generate(
            messages=payload.messages or [],
            model=payload.model,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
    except ProviderConfigurationError:
        await record_gateway_audit(
            request,
            current_user,
            action="gateway_provider_error",
            provider=payload.provider,
            model=payload.model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="WARNING",
            metadata={"code": "provider_not_configured"},
        )
        return _error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="provider_not_configured",
            message=f"{payload.provider} provider is not configured.",
            request_id=request_id,
        )
    except ProviderFailure as exc:
        await record_gateway_audit(
            request,
            current_user,
            action="gateway_provider_error",
            provider=payload.provider,
            model=payload.model,
            request_id=request_id,
            prompt_preview=prompt,
            severity="WARNING",
            metadata={"code": exc.code, "retryable": exc.retryable},
        )
        return _error_response(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code=exc.code,
            message="AI provider request failed safely.",
            request_id=request_id,
            details={"retryable": exc.retryable},
        )

    usage = provider_response.usage
    await record_gateway_usage(
        request,
        current_user,
        provider=provider_response.provider,
        model=provider_response.model,
        usage=usage,
        status="allowed",
        security_decision=decision,
        request_id=request_id,
        prompt_preview=prompt,
    )
    await record_gateway_audit(
        request,
        current_user,
        action="gateway_request_allowed",
        provider=provider_response.provider,
        model=provider_response.model,
        request_id=request_id,
        prompt_preview=prompt,
        severity="INFO",
        metadata={"risk_score": risk_score, "total_tokens": usage.total_tokens},
    )
    response = GatewayChatResponse(
        provider=provider_response.provider,
        model=provider_response.model,
        content=redact_sensitive_data(provider_response.content),
        usage=usage,
        security=GatewaySecurity(**security_payload),
        request_id=request_id,
    )
    return ok(response.model_dump(mode="json"))
