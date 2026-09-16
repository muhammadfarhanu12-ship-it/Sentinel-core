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


class XAIProvider(AIProvider):
    provider_name = "xai"

    def validate_config(self) -> None:
        if not str(settings.XAI_API_KEY or "").strip():
            raise ProviderConfigurationError("xAI provider is not configured.")

    async def generate(
        self,
        *,
        messages: list[GatewayMessage],
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        self.validate_config()
        payload: dict[str, Any] = {
            "model": model,
            "messages": [{"role": message.role, "content": message.content} for message in messages],
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        try:
            async with httpx.AsyncClient(timeout=float(getattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 30.0))) as client:
                response = await client.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.XAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise ProviderFailure("provider_timeout", "xAI timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderFailure("provider_unavailable", "xAI is unavailable.", retryable=True) from exc

        if response.status_code == 408:
            raise ProviderFailure("provider_timeout", "xAI timed out.", retryable=True)
        if response.status_code == 429:
            raise ProviderFailure("provider_rate_limited", "xAI rate limit exceeded.", retryable=True)
        if response.status_code >= 500:
            raise ProviderFailure("provider_unavailable", "xAI is temporarily unavailable.", retryable=True)
        if response.status_code >= 400:
            logger.warning("xAI provider returned status=%s", response.status_code)
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = {}
            # xAI can return a flat {"code": ..., "error": "..."} body,
            # including HTTP 400 for an incorrect API key.
            error_text = ""
            if isinstance(error_payload, dict):
                error = error_payload.get("error")
                if isinstance(error, dict):
                    error_text = str(error.get("message") or "")
                elif isinstance(error, str):
                    error_text = error
                else:
                    error_text = str(error_payload.get("message") or "")
            error_text = error_text.lower()
            if response.status_code == 404 or (
                "model" in error_text
                and any(token in error_text for token in ("not found", "does not exist", "unavailable", "does not have access", "not have access"))
            ):
                raise ProviderFailure("provider_model_unavailable", "xAI model is unavailable for the configured account.")
            if response.status_code in {401, 403} or (
                "api key" in error_text
                and any(token in error_text for token in ("incorrect", "invalid", "disabled", "blocked"))
            ):
                raise ProviderFailure("provider_auth_error", "xAI rejected the configured credentials.")
            raise ProviderFailure("provider_error", "xAI rejected the request.")

        try:
            body = response.json()
            choice = body["choices"][0]
            content = choice["message"].get("content") or ""
            if not isinstance(content, str):
                raise ValueError("Invalid content")
            content = content.strip()
            usage_meta = body.get("usage") or {}
            if not isinstance(usage_meta, dict):
                raise ValueError("Invalid usage")
        except (ValueError, TypeError, KeyError, IndexError, AttributeError) as exc:
            raise ProviderFailure("provider_error", "xAI returned an invalid response.") from exc

        def reported_tokens(name: str) -> int | None:
            value = usage_meta.get(name)
            return value if type(value) is int and value >= 0 else None

        input_tokens = reported_tokens("prompt_tokens")
        output_tokens = reported_tokens("completion_tokens")
        total_tokens = reported_tokens("total_tokens")
        estimated = any(value is None for value in (input_tokens, output_tokens, total_tokens))
        if input_tokens is None:
            input_tokens = estimate_messages_tokens(messages)
        if output_tokens is None:
            output_tokens = estimate_tokens(content)
        if total_tokens is None:
            total_tokens = input_tokens + output_tokens

        return ProviderResponse(
            provider=self.provider_name,
            model=model,
            content=content,
            usage=GatewayUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                estimated_cost=0.0,
                estimated=estimated,
            ),
            raw_metadata={"finish_reason": choice.get("finish_reason")},
        )
