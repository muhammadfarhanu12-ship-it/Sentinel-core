from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import Request

from app.schemas.gateway_schema import GatewayUsage
from app.services.dashboard_service import (
    client_ip_for,
    collection_from_request,
    email_for,
    next_numeric_id,
    public_document,
    record_audit_event,
    redact_sensitive_data,
    utcnow,
    user_id_for,
    workspace_id_for,
)

_fallback_gateway_usage: list[dict[str, Any]] = []

PRICING_PER_1K_TOKENS: dict[tuple[str, str], tuple[float, float]] = {
    ("openai", "gpt-4o-mini"): (0.0, 0.0),
    ("openai", "gpt-4o"): (0.0, 0.0),
    ("openai", "gpt-4.1"): (0.0, 0.0),
    ("gemini", "gemini-1.5-flash"): (0.0, 0.0),
    ("gemini", "gemini-1.5-pro"): (0.0, 0.0),
}


def estimate_cost(provider: str, model: str, usage: GatewayUsage) -> float:
    input_price, output_price = PRICING_PER_1K_TOKENS.get((provider.lower(), model), (0.0, 0.0))
    return round(((usage.input_tokens / 1000.0) * input_price) + ((usage.output_tokens / 1000.0) * output_price), 8)


async def record_gateway_usage(
    request: Request,
    current_user: dict[str, Any],
    *,
    provider: str,
    model: str,
    usage: GatewayUsage,
    status: str,
    security_decision: str,
    request_id: str,
    prompt_preview: str,
    error_code: str | None = None,
) -> dict[str, Any]:
    now = utcnow()
    usage.estimated_cost = estimate_cost(provider, model, usage)
    document = {
        "id": await next_numeric_id(
            request,
            namespace="gateway_usage",
            collection_name="gateway_usage",
            fallback_items=_fallback_gateway_usage,
        ),
        "workspace_id": workspace_id_for(current_user),
        "organization_id": workspace_id_for(current_user),
        "user_id": user_id_for(current_user),
        "user_email": email_for(current_user),
        "provider": provider,
        "model": model,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "total_tokens": usage.total_tokens,
        "estimated_cost": usage.estimated_cost,
        "usage_estimated": usage.estimated,
        "security_decision": security_decision,
        "status": status,
        "request_id": request_id,
        "prompt_preview": redact_sensitive_data(prompt_preview[:500]),
        "error_code": error_code,
        "ip_address": client_ip_for(request),
        "timestamp": now,
        "created_at": now,
    }
    collection = collection_from_request(request, "gateway_usage")
    if collection is not None:
        await collection.insert_one(document)
    else:
        _fallback_gateway_usage.append(document)
    return public_document(document, exclude={"workspace_id"})


async def count_gateway_usage_since(request: Request, current_user: dict[str, Any], since: datetime) -> int:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "gateway_usage")
    if collection is not None:
        return int(await collection.count_documents({"workspace_id": workspace_id, "timestamp": {"$gte": since}}))
    return sum(
        1
        for item in _fallback_gateway_usage
        if item.get("workspace_id") == workspace_id and item.get("timestamp") >= since
    )


async def record_gateway_audit(
    request: Request,
    current_user: dict[str, Any],
    *,
    action: str,
    provider: str,
    model: str,
    request_id: str,
    prompt_preview: str,
    severity: str = "INFO",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await record_audit_event(
        request,
        current_user=current_user,
        action=action,
        resource="gateway",
        severity=severity,
        metadata={
            "provider": provider,
            "model": model,
            "request_id": request_id,
            "prompt_preview": redact_sensitive_data(prompt_preview[:500]),
            **(metadata or {}),
        },
    )
