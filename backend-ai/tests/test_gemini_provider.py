from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.schemas.gateway_schema import GatewayMessage
from app.services.ai_providers import gemini_provider


@pytest.mark.parametrize("model,uses_default_sampling", [
    ("gemini-1.5-flash", False),
    ("gemini-2.5-flash-lite", False),
    ("gemini-2.5-flash", False),
    ("gemini-2.5-pro", False),
    ("gemini-3-flash-preview", True),
    ("gemini-3.1-pro-preview", True),
    ("gemini-3.1-flash-lite", True),
    ("gemini-3.5-flash-lite", True),
    ("gemini-3.5-flash", True),
    ("gemini-3.6-flash", True),
    ("gemini-3.7-flash", True),
    ("gemini-3.8-flash", True),
])
def test_gemini_models_preserve_messages_and_use_compatible_sampling(monkeypatch, model, uses_default_sampling):
    monkeypatch.setattr(gemini_provider, "settings", SimpleNamespace(
        GEMINI_API_KEY="test-gemini-key", AI_PROVIDER_TIMEOUT_SECONDS=7.5,
    ))
    real_client = httpx.AsyncClient

    def handler(request):
        assert request.url.path == f"/v1beta/models/{model}:generateContent"
        assert request.url.params["key"] == "test-gemini-key"
        payload = json.loads(request.content)
        assert payload["systemInstruction"] == {"parts": [{"text": "Be concise"}]}
        assert payload["contents"] == [
            {"role": "user", "parts": [{"text": "Hello"}]},
            {"role": "model", "parts": [{"text": "Hi"}]},
            {"role": "user", "parts": [{"text": "Continue"}]},
        ]
        expected_config = {"maxOutputTokens": 1024}
        if not uses_default_sampling:
            expected_config["temperature"] = 0.2
        assert payload["generationConfig"] == expected_config
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [
                {"text": "Internal reasoning", "thought": True},
                {"text": "Final answer."},
            ]}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 4, "totalTokenCount": 20},
        })

    monkeypatch.setattr(gemini_provider.httpx, "AsyncClient", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handler), **kwargs,
    ))
    response = asyncio.run(gemini_provider.GeminiProvider().generate(
        messages=[
            GatewayMessage(role="system", content="Be concise"),
            GatewayMessage(role="user", content="Hello"),
            GatewayMessage(role="assistant", content="Hi"),
            GatewayMessage(role="user", content="Continue"),
        ],
        model=model, temperature=0.2, max_tokens=1024,
    ))
    assert response.model == model
    assert response.content == "Final answer."
    assert response.usage.input_tokens == 8
    assert response.usage.output_tokens == 4
    assert response.usage.total_tokens == 20
    assert response.usage.estimated is False
