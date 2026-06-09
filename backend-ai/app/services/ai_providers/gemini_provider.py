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


class GeminiProvider(AIProvider):
    provider_name = "gemini"

    def validate_config(self) -> None:
        if not str(settings.GEMINI_API_KEY or "").strip():
            raise ProviderConfigurationError("Gemini provider is not configured.")

    async def generate(
        self,
        *,
        messages: list[GatewayMessage],
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        self.validate_config()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        contents = [
            {
                "role": "model" if message.role == "assistant" else "user",
                "parts": [{"text": message.content}],
            }
            for message in messages
            if message.role != "system"
        ]
        system_parts = [{"text": message.content} for message in messages if message.role == "system"]
        payload: dict[str, Any] = {
            "contents": contents or [{"role": "user", "parts": [{"text": ""}]}],
            "generationConfig": {},
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": system_parts}
        if temperature is not None:
            payload["generationConfig"]["temperature"] = temperature
        if max_tokens is not None:
            payload["generationConfig"]["maxOutputTokens"] = max_tokens

        try:
            async with httpx.AsyncClient(timeout=float(getattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 30.0))) as client:
                response = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=payload)
        except httpx.TimeoutException as exc:
            raise ProviderFailure("provider_timeout", "Gemini timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderFailure("provider_unavailable", "Gemini is unavailable.", retryable=True) from exc

        if response.status_code in {401, 403}:
            raise ProviderFailure("provider_auth_error", "Gemini rejected the configured credentials.")
        if response.status_code == 429:
            raise ProviderFailure("provider_rate_limited", "Gemini rate limit exceeded.", retryable=True)
        if response.status_code == 404:
            raise ProviderFailure("provider_model_unavailable", "Gemini model is unavailable for the configured account.")
        if response.status_code >= 500:
            raise ProviderFailure("provider_unavailable", "Gemini is temporarily unavailable.", retryable=True)
        if response.status_code >= 400:
            logger.warning("Gemini provider returned status=%s", response.status_code)
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = {}
            error_text = str(error_payload).lower()
            if "model" in error_text and any(token in error_text for token in {"not found", "unsupported", "unavailable"}):
                raise ProviderFailure("provider_model_unavailable", "Gemini model is unavailable for the configured account.")
            raise ProviderFailure("provider_error", "Gemini rejected the request.")

        body = response.json()
        content = ""
        for candidate in body.get("candidates") or []:
            parts = ((candidate.get("content") or {}).get("parts") or [])
            content = "".join(str(part.get("text") or "") for part in parts).strip()
            if content:
                break

        usage_meta = body.get("usageMetadata") or {}
        input_tokens = int(usage_meta.get("promptTokenCount") or estimate_messages_tokens(messages))
        output_tokens = int(usage_meta.get("candidatesTokenCount") or estimate_tokens(content))
        total_tokens = int(usage_meta.get("totalTokenCount") or (input_tokens + output_tokens))
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
            raw_metadata={"finish_reason": (body.get("candidates") or [{}])[0].get("finishReason")},
        )
