from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.tier import TIER_LIMITS, require_scan_entitlement
from app.schemas.gateway_schema import GatewayChatRequest
from app.schemas.scan_schema import ScanRequest
from app.services.ai_providers import get_provider


@pytest.mark.parametrize("provider", ["openai", "gemini", "anthropic", "xai"])
def test_catalog_models_are_accepted_by_both_request_schemas_and_have_an_adapter(provider):
    assert get_provider(provider).provider_name == provider
    for model in TIER_LIMITS["BUSINESS"].allowed_models[provider]:
        gateway = GatewayChatRequest(provider=provider, model=model, prompt="Hello")
        scan = ScanRequest(provider=provider, model=model, prompt="Hello")
        assert gateway.model == scan.model == model


@pytest.mark.parametrize("provider,model,minimum_plan", [
    ("openai", "gpt-5.6-luna", "PRO"),
    ("openai", "gpt-6-astra", "BUSINESS"),
    ("gemini", "gemini-3.5-flash-lite", "FREE"),
    ("gemini", "gemini-3.8-flash", "PRO"),
    ("gemini", "gemini-3.1-pro-preview", "BUSINESS"),
    ("anthropic", "claude-haiku-4-5-20251001", "PRO"),
    ("anthropic", "claude-sonnet-5", "PRO"),
    ("anthropic", "claude-fable-5-1", "BUSINESS"),
    ("xai", "grok-build-0.1", "PRO"),
    ("xai", "grok-4.6", "BUSINESS"),
])
def test_new_model_entitlements_cannot_be_bypassed(provider, model, minimum_plan):
    plans = list(TIER_LIMITS)
    for plan in plans:
        request = dict(active_tier=plan, requested_tier="FREE", provider=provider, model=model, prompt="Hello")
        if plans.index(plan) < plans.index(minimum_plan):
            with pytest.raises(HTTPException) as failure:
                require_scan_entitlement(**request)
            assert failure.value.status_code == 403
        else:
            assert require_scan_entitlement(**request).name == plan


def test_scan_rejects_model_from_another_provider():
    with pytest.raises(ValidationError, match="Unsupported model"):
        ScanRequest(provider="anthropic", model="grok-4.6", prompt="Hello")


def test_higher_tiers_retain_lower_tier_model_access():
    for lower, higher in (("FREE", "PRO"), ("PRO", "BUSINESS")):
        for provider, models in TIER_LIMITS[lower].allowed_models.items():
            assert models <= TIER_LIMITS[higher].allowed_models.get(provider, frozenset())
