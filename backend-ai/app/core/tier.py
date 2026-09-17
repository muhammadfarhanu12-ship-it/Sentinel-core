from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status


TIER_ORDER = {"FREE": 0, "PRO": 1, "BUSINESS": 2}

# Text-chat aliases supported by /v1/chat/completions (verified 2026-09-17).
# https://developers.openai.com/api/docs/models/all
# https://developers.openai.com/api/docs/deprecations
# Legacy 3.5/4/4-turbo/4.1-nano/o1/o3-mini/o4-mini retire on 2026-10-23;
# GPT-5/mini/nano and o3 retire on 2026-12-11.
OPENAI_PRO_MODELS = frozenset({
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "o3-mini",
    "o4-mini",
    "gpt-3.5-turbo",
})
OPENAI_BUSINESS_MODELS = OPENAI_PRO_MODELS | frozenset({
    "gpt-4.1",
    "gpt-6-astra",
    "gpt-5.6-sol",
    "chat-latest",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "o3",
    "o1",
    "gpt-4",
    "gpt-4-turbo",
})

# Exact API IDs verified against the providers' model catalogs.
# https://platform.claude.com/docs/en/about-claude/model-deprecations
# https://docs.x.ai/developers/pricing
ANTHROPIC_PRO_MODELS = frozenset({
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
})
ANTHROPIC_BUSINESS_MODELS = ANTHROPIC_PRO_MODELS | frozenset({
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-fable-5",
    "claude-fable-5-1",
})
XAI_PRO_MODELS = frozenset({
    "grok-build-0.1",
    "grok-4.3",
    "grok-4.20-0309-reasoning",
    "grok-4.20-0309-non-reasoning",
})
XAI_BUSINESS_MODELS = XAI_PRO_MODELS | frozenset({"grok-4.5", "grok-4.6"})

# https://ai.google.dev/gemini-api/docs/models
# Preserve the existing 1.5 options for compatibility, although Google retired
# them on 2025-09-29. All newly added IDs are currently listed in the catalog.
GEMINI_FREE_MODELS = frozenset({
    "gemini-1.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
})
GEMINI_PRO_MODELS = GEMINI_FREE_MODELS | frozenset({
    "gemini-1.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
})
GEMINI_BUSINESS_MODELS = GEMINI_PRO_MODELS | frozenset({"gemini-3.1-pro-preview"})


# Presentation metadata only: models outside these sets remain supported with
# recommended=False. Subscription entitlements are defined separately below.
# Current general-purpose choices verified against the official catalogs on
# 2026-09-17; each provider keeps both capable and lower-cost options visible.
RECOMMENDED_MODELS: dict[str, frozenset[str]] = {
    # https://developers.openai.com/api/docs/models
    "openai": frozenset({
        "gpt-6-astra",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
    }),
    # https://ai.google.dev/gemini-api/docs/models
    "gemini": frozenset({
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-pro-preview",
    }),
    # https://platform.claude.com/docs/en/models/overview
    "anthropic": frozenset({
        "claude-fable-5-1",
        "claude-opus-5",
        "claude-sonnet-5",
        "claude-haiku-4-5-20251001",
    }),
    # https://docs.x.ai/developers/models/grok-4.6
    # https://docs.x.ai/developers/models/grok-4.3
    "xai": frozenset({"grok-4.6", "grok-4.3"}),
}


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
            "gemini": GEMINI_FREE_MODELS,
            "anthropic": frozenset(),
            "xai": frozenset(),
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
            "openai": OPENAI_PRO_MODELS,
            "gemini": GEMINI_PRO_MODELS,
            "anthropic": ANTHROPIC_PRO_MODELS,
            "xai": XAI_PRO_MODELS,
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
            "openai": OPENAI_BUSINESS_MODELS,
            "gemini": GEMINI_BUSINESS_MODELS,
            "anthropic": ANTHROPIC_BUSINESS_MODELS,
            "xai": XAI_BUSINESS_MODELS,
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
