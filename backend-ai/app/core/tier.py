from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status


TIER_ORDER = {"FREE": 0, "PRO": 1, "BUSINESS": 2}


@dataclass(frozen=True)
class TierLimits:
    name: str
    monthly_requests: int
    requests_per_minute: int
    max_prompt_chars: int
    max_api_keys: int | None
    audit_retention_days: int
    allowed_security_tiers: frozenset[str]
    allowed_models: dict[str, frozenset[str]]
    features: frozenset[str]


TIER_LIMITS: dict[str, TierLimits] = {
    "FREE": TierLimits(
        name="FREE",
        monthly_requests=1_000,
        requests_per_minute=30,
        max_prompt_chars=4_000,
        max_api_keys=1,
        audit_retention_days=7,
        allowed_security_tiers=frozenset({"FREE"}),
        allowed_models={
            "local": frozenset({"local"}),
            "gemini": frozenset({"gemini-3.1-pro"}),
        },
        features=frozenset({"basic_scanning", "pii_scan", "basic_audit"}),
    ),
    "PRO": TierLimits(
        name="PRO",
        monthly_requests=50_000,
        requests_per_minute=300,
        max_prompt_chars=12_000,
        max_api_keys=5,
        audit_retention_days=30,
        allowed_security_tiers=frozenset({"FREE", "PRO"}),
        allowed_models={
            "local": frozenset({"local"}),
            "openai": frozenset({"gpt-5.4"}),
            "gemini": frozenset({"gemini-3.1-pro"}),
        },
        features=frozenset({"advanced_scanning", "indirect_injection", "team_dashboard", "email_alerts"}),
    ),
    "BUSINESS": TierLimits(
        name="BUSINESS",
        monthly_requests=250_000,
        requests_per_minute=1_200,
        max_prompt_chars=25_000,
        max_api_keys=None,
        audit_retention_days=365,
        allowed_security_tiers=frozenset({"FREE", "PRO", "BUSINESS"}),
        allowed_models={
            "local": frozenset({"local"}),
            "openai": frozenset({"gpt-5.4"}),
            "gemini": frozenset({"gemini-3.1-pro"}),
            "anthropic": frozenset({"claude-4.6"}),
        },
        features=frozenset({"enterprise_policy", "tool_interception", "mfa_2fa", "human_review", "long_retention"}),
    ),
}


DEFAULT_SCAN_TIER_BY_PLAN = {
    "FREE": "FREE",
    "PRO": "PRO",
    "BUSINESS": "PRO",
}


def normalize_tier(value: Any, *, default: str = "FREE") -> str:
    normalized = str(value or default).strip().upper()
    return normalized if normalized in TIER_LIMITS else default


def tier_limits_for(value: Any) -> TierLimits:
    return TIER_LIMITS[normalize_tier(value)]


def tier_rank(value: Any) -> int:
    return TIER_ORDER[normalize_tier(value)]


def requested_scan_tier(*values: Any, active_tier: str) -> tuple[str, bool]:
    for value in values:
        normalized = str(value or "").strip().upper()
        if normalized in TIER_LIMITS:
            return normalized, True
    return DEFAULT_SCAN_TIER_BY_PLAN[normalize_tier(active_tier)], False


def require_scan_entitlement(
    *,
    active_tier: str,
    requested_tier: str,
    provider: str,
    model: str,
    prompt: str,
) -> TierLimits:
    limits = tier_limits_for(active_tier)
    requested = normalize_tier(requested_tier)
    provider_value = str(provider or "").strip().lower()
    model_value = str(model or "").strip()

    if requested not in limits.allowed_security_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{requested} security scanning requires an upgraded plan.",
        )

    allowed_models = limits.allowed_models.get(provider_value)
    if allowed_models is None or model_value not in allowed_models:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Model '{model_value}' on provider '{provider_value}' is not available on the {limits.name} plan.",
        )

    if len(prompt or "") > limits.max_prompt_chars:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "message": "Prompt exceeds the active plan limit.",
                "max_prompt_chars": limits.max_prompt_chars,
                "tier": limits.name,
            },
        )

    return limits
