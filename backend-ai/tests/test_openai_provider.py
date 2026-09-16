from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.schemas.gateway_schema import GatewayMessage
from app.services.ai_providers import openai_provider
from app.services.ai_providers.base import ProviderConfigurationError, ProviderFailure


@pytest.fixture
def mock_openai(monkeypatch):
    monkeypatch.setattr(openai_provider, "settings", SimpleNamespace(
        OPENAI_API_KEY="test-openai-key", AI_PROVIDER_TIMEOUT_SECONDS=7.5,
    ))
    real_client = httpx.AsyncClient

    def install(handler):
        def client(**kwargs):
            assert kwargs["timeout"] == 7.5
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(openai_provider.httpx, "AsyncClient", client)

    return install


def _generate(**kwargs):
    return asyncio.run(openai_provider.OpenAIProvider().generate(
        messages=kwargs.pop("messages", [GatewayMessage(role="user", content="Hello")]),
        model=kwargs.pop("model", "gpt-6-astra"),
        **kwargs,
    ))


def _success():
    return httpx.Response(200, json={
        "choices": [{"message": {"content": "Hello!"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 7, "total_tokens": 19},
    })


@pytest.mark.parametrize("model", [
    "gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "chat-latest",
    "gpt-5.5", "gpt-5.5-2026-04-23", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano",
    "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano",
    "o3", "o3-2025-04-16", "o3-mini", "o4-mini", "o1",
])
def test_reasoning_models_use_completion_limit_and_preserve_default_reasoning(mock_openai, model):
    def handler(request):
        assert str(request.url) == "https://api.openai.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-openai-key"
        assert json.loads(request.content) == {
            "model": model,
            "messages": [{"role": "user", "content": "Hello"}],
            "max_completion_tokens": 4096,
        }
        return _success()

    mock_openai(handler)
    result = _generate(model=model, max_tokens=4096, temperature=0.2)
    assert result.provider == "openai"
    assert result.model == model
    assert result.content == "Hello!"
    assert result.usage.input_tokens == 12
    assert result.usage.output_tokens == 7
    assert result.usage.total_tokens == 19
    assert result.usage.estimated is False
    assert result.raw_metadata == {"finish_reason": "stop"}


@pytest.mark.parametrize("model", [
    "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo",
])
def test_existing_chat_models_keep_sampling_limits_and_message_roles(mock_openai, model):
    def handler(request):
        assert json.loads(request.content) == {
            "model": model,
            "messages": [
                {"role": "system", "content": "Be concise"},
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
            ],
            "temperature": 0.2,
            "max_tokens": 256,
        }
        return _success()

    mock_openai(handler)
    _generate(model=model, messages=[
        GatewayMessage(role="system", content="Be concise"),
        GatewayMessage(role="user", content="Hello"),
        GatewayMessage(role="assistant", content="Hi"),
    ], max_tokens=256, temperature=0.2)


@pytest.mark.parametrize("model", ["gpt-6-astra", "gpt-5.6-sol", "gpt-4o-mini"])
def test_omitted_generation_options_stay_omitted(mock_openai, model):
    def handler(request):
        assert json.loads(request.content) == {
            "model": model,
            "messages": [{"role": "user", "content": "Hello"}],
        }
        return _success()

    mock_openai(handler)
    _generate(model=model)


def test_openai_requires_configured_credentials(mock_openai, monkeypatch):
    monkeypatch.setattr(openai_provider.settings, "OPENAI_API_KEY", " ")
    with pytest.raises(ProviderConfigurationError, match="not configured"):
        _generate()


@pytest.mark.parametrize("status, code, retryable", [
    (400, "provider_error", False),
    (401, "provider_auth_error", False),
    (403, "provider_auth_error", False),
    (404, "provider_model_unavailable", False),
    (429, "provider_rate_limited", True),
    (500, "provider_unavailable", True),
])
def test_new_models_preserve_safe_http_errors(mock_openai, status, code, retryable):
    mock_openai(lambda request: httpx.Response(status, json={
        "error": {"message": "private upstream information"},
    }))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is retryable
    assert "private" not in caught.value.message


@pytest.mark.parametrize("exception, code", [
    (httpx.ReadTimeout("private upstream information"), "provider_timeout"),
    (httpx.ConnectError("private upstream information"), "provider_unavailable"),
])
def test_new_models_preserve_safe_network_errors(mock_openai, exception, code):
    def handler(request):
        raise exception

    mock_openai(handler)
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is True
    assert "private" not in caught.value.message
