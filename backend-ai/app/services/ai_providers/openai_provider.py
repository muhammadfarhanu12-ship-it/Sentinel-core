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


class OpenAIProvider(AIProvider):
    provider_name = "openai"

    def validate_config(self) -> None:
        if not str(settings.OPENAI_API_KEY or "").strip():
            raise ProviderConfigurationError("OpenAI provider is not configured.")

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
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise ProviderFailure("provider_timeout", "OpenAI timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderFailure("provider_unavailable", "OpenAI is unavailable.", retryable=True) from exc

        if response.status_code in {401, 403}:
            raise ProviderFailure("provider_auth_failed", "OpenAI rejected the configured credentials.")
        if response.status_code == 429:
            raise ProviderFailure("provider_rate_limited", "OpenAI rate limit exceeded.", retryable=True)
        if response.status_code >= 500:
            raise ProviderFailure("provider_unavailable", "OpenAI is temporarily unavailable.", retryable=True)
        if response.status_code >= 400:
            logger.warning("OpenAI provider returned status=%s", response.status_code)
            raise ProviderFailure("provider_error", "OpenAI rejected the request.")

        body = response.json()
        choice = (body.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = str(message.get("content") or "").strip()
        usage_meta = body.get("usage") or {}
        input_tokens = int(usage_meta.get("prompt_tokens") or estimate_messages_tokens(messages))
        output_tokens = int(usage_meta.get("completion_tokens") or estimate_tokens(content))
        total_tokens = int(usage_meta.get("total_tokens") or (input_tokens + output_tokens))
        return ProviderResponse(
            provider=self.provider_name,
            model=model,
            content=content,
            usage=GatewayUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                estimated_cost=0.0,
                estimated=not bool(usage_meta),
            ),
            raw_metadata={"finish_reason": choice.get("finish_reason")},
        )
