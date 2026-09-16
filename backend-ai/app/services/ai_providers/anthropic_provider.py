from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.gateway_schema import GatewayMessage, GatewayUsage
from app.services.ai_providers.base import (
    AIProvider,
    ProviderConfigurationError,
    ProviderFailure,
    ProviderResponse,
    estimate_messages_tokens,
    estimate_tokens,
)

logger = logging.getLogger(__name__)

# https://platform.claude.com/docs/en/api/messages/create
# Claude 4.7 and later use fixed sampling; Claude 4.6 and later reject prefill.
_FIXED_TEMPERATURE_MODELS = frozenset({
    "claude-fable-5-1", "claude-fable-5", "claude-opus-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5",
})
_NO_PREFILL_MODELS = _FIXED_TEMPERATURE_MODELS | {"claude-opus-4-6", "claude-sonnet-4-6"}


class AnthropicProvider(AIProvider):
    provider_name = "anthropic"

    def validate_config(self) -> None:
        if not str(settings.ANTHROPIC_API_KEY or "").strip():
            raise ProviderConfigurationError("Anthropic provider is not configured.")

    async def generate(
        self,
        *,
        messages: list[GatewayMessage],
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        self.validate_config()
        conversation = [
            {"role": message.role, "content": message.content}
            for message in messages if message.role != "system"
        ]
        if not conversation:
            raise ProviderFailure("provider_error", "Anthropic requires a user or assistant message.")
        if model in _NO_PREFILL_MODELS and conversation[-1]["role"] == "assistant":
            raise ProviderFailure("provider_error", "This Anthropic model requires the conversation to end with a user message.")

        payload: dict[str, Any] = {
            "model": model,
            "messages": conversation,
            "max_tokens": max_tokens if max_tokens is not None else 4096,
        }
        system = [{"type": "text", "text": message.content} for message in messages if message.role == "system"]
        if system:
            payload["system"] = system
        if temperature is not None and model not in _FIXED_TEMPERATURE_MODELS:
            if not 0.0 <= temperature <= 1.0:
                raise ProviderFailure("provider_error", "Anthropic temperature must be between 0 and 1.")
            payload["temperature"] = temperature

        try:
            async with httpx.AsyncClient(timeout=float(getattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 30.0))) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise ProviderFailure("provider_timeout", "Anthropic timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderFailure("provider_unavailable", "Anthropic is unavailable.", retryable=True) from exc

        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error") if isinstance(body, dict) else None
        error_type = str(error.get("type") or "") if isinstance(error, dict) else ""
        if response.status_code >= 400 or (isinstance(body, dict) and body.get("type") == "error"):
            # https://platform.claude.com/docs/en/api/errors
            if response.status_code in {401, 403} or error_type in {"authentication_error", "permission_error"}:
                raise ProviderFailure("provider_auth_error", "Anthropic rejected the configured credentials.")
            if response.status_code == 429 or error_type == "rate_limit_error":
                raise ProviderFailure("provider_rate_limited", "Anthropic rate limit exceeded.", retryable=True)
            if response.status_code == 404 or error_type == "not_found_error":
                raise ProviderFailure("provider_model_unavailable", "Anthropic model is unavailable for the configured account.")
            if response.status_code in {408, 504} or error_type == "timeout_error":
                raise ProviderFailure("provider_timeout", "Anthropic timed out.", retryable=True)
            if response.status_code >= 500 or error_type in {"api_error", "overloaded_error"}:
                raise ProviderFailure("provider_unavailable", "Anthropic is temporarily unavailable.", retryable=True)
            logger.warning("Anthropic provider returned status=%s", response.status_code)
            raise ProviderFailure("provider_error", "Anthropic rejected the request.")

        if not isinstance(body, dict) or not isinstance(body.get("content"), list):
            raise ProviderFailure("provider_error", "Anthropic returned an invalid response.")
        content = "".join(
            block["text"] for block in body["content"]
            if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
        ).strip()
        usage_meta = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        estimated = usage_meta.get("input_tokens") is None or usage_meta.get("output_tokens") is None
        try:
            if usage_meta.get("input_tokens") is not None:
                # Cached input is reported separately from uncached input by Anthropic.
                input_tokens = int(usage_meta["input_tokens"])
                input_tokens += int(usage_meta.get("cache_creation_input_tokens") or 0) + int(usage_meta.get("cache_read_input_tokens") or 0)
            else:
                input_tokens = estimate_messages_tokens(messages)
            output_tokens = int(usage_meta["output_tokens"]) if usage_meta.get("output_tokens") is not None else estimate_tokens(content)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ProviderFailure("provider_error", "Anthropic returned invalid usage data.") from exc

        return ProviderResponse(
            provider=self.provider_name,
            model=model,
            content=content,
            usage=GatewayUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                estimated_cost=0.0,
                estimated=estimated,
            ),
            raw_metadata={"finish_reason": body.get("stop_reason")},
        )
