from __future__ import annotations

from app.services.ai_providers.base import AIProvider, ProviderConfigurationError
from app.services.ai_providers.gemini_provider import GeminiProvider
from app.services.ai_providers.openai_provider import OpenAIProvider


def get_provider(provider: str) -> AIProvider:
    normalized = str(provider or "").strip().lower()
    if normalized == "gemini":
        return GeminiProvider()
    if normalized == "openai":
        return OpenAIProvider()
    raise ProviderConfigurationError("Unsupported provider.")
