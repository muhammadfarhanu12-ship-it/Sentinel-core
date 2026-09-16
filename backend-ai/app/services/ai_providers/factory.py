from __future__ import annotations

from app.services.ai_providers.base import AIProvider, ProviderConfigurationError
from app.services.ai_providers.anthropic_provider import AnthropicProvider
from app.services.ai_providers.gemini_provider import GeminiProvider
from app.services.ai_providers.openai_provider import OpenAIProvider
from app.services.ai_providers.xai_provider import XAIProvider


def get_provider(provider: str) -> AIProvider:
    normalized = str(provider or "").strip().lower()
    if normalized == "gemini":
        return GeminiProvider()
    if normalized == "openai":
        return OpenAIProvider()
    if normalized == "anthropic":
        return AnthropicProvider()
    if normalized == "xai":
        return XAIProvider()
    raise ProviderConfigurationError("Unsupported provider.")
