from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.schemas.gateway_schema import GatewayMessage
from app.services.ai_providers import anthropic_provider
from app.services.ai_providers.base import ProviderConfigurationError, ProviderFailure


@pytest.fixture
def mock_anthropic(monkeypatch):
    monkeypatch.setattr(anthropic_provider, "settings", SimpleNamespace(
        ANTHROPIC_API_KEY="test-anthropic-key", AI_PROVIDER_TIMEOUT_SECONDS=7.5,
    ))
    real_client = httpx.AsyncClient

    def install(handler):
        def client(**kwargs):
            assert kwargs["timeout"] == 7.5
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(anthropic_provider.httpx, "AsyncClient", client)

    return install


def _generate(**kwargs):
    return asyncio.run(anthropic_provider.AnthropicProvider().generate(
        messages=kwargs.pop("messages", [GatewayMessage(role="user", content="Hello")]),
        model=kwargs.pop("model", "claude-haiku-4-5-20251001"),
        **kwargs,
    ))


def _success(**kwargs):
    return httpx.Response(200, json={
        "type": "message",
        "content": [{"type": "text", "text": "Hello!"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 12, "output_tokens": 3},
        **kwargs,
    })


def test_anthropic_messages_auth_system_and_usage(mock_anthropic):
    def handler(request):
        assert str(request.url) == "https://api.anthropic.com/v1/messages"
        assert request.headers["x-api-key"] == "test-anthropic-key"
        assert request.headers["anthropic-version"] == "2023-06-01"
        assert "authorization" not in request.headers
        payload = json.loads(request.content)
        assert payload == {
            "model": "claude-haiku-4-5-20251001",
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
                {"role": "user", "content": "Continue"},
            ],
            "system": [{"type": "text", "text": "Be helpful"}, {"type": "text", "text": "Be concise"}],
            "max_tokens": 256,
            "temperature": 0.4,
        }
        return _success(content=[
            {"type": "thinking", "thinking": "private reasoning", "signature": "private-signature"},
            {"type": "text", "text": "Hello "},
            {"type": "text", "text": "world!"},
        ], usage={"input_tokens": 12, "output_tokens": 7, "cache_creation_input_tokens": 4, "cache_read_input_tokens": 6})

    mock_anthropic(handler)
    result = _generate(messages=[
        GatewayMessage(role="system", content="Be helpful"),
        GatewayMessage(role="system", content="Be concise"),
        GatewayMessage(role="user", content="Hello"),
        GatewayMessage(role="assistant", content="Hi"),
        GatewayMessage(role="user", content="Continue"),
    ], max_tokens=256, temperature=0.4)
    assert result.provider == "anthropic"
    assert result.model == "claude-haiku-4-5-20251001"
    assert result.content == "Hello world!"
    assert result.usage.input_tokens == 22
    assert result.usage.output_tokens == 7
    assert result.usage.total_tokens == 29
    assert result.usage.estimated is False
    assert result.raw_metadata == {"finish_reason": "end_turn"}
    assert "private" not in str(result)


@pytest.mark.parametrize("model", [
    "claude-fable-5-1", "claude-fable-5", "claude-opus-5", "claude-opus-4-8",
    "claude-opus-4-7", "claude-sonnet-5",
])
def test_anthropic_new_models_omit_unsupported_sampling(mock_anthropic, model):
    def handler(request):
        payload = json.loads(request.content)
        assert payload["model"] == model
        assert payload["max_tokens"] == 4096
        assert "system" not in payload
        assert "temperature" not in payload
        assert "thinking" not in payload  # Preserve the model's default thinking mode.
        return _success()

    mock_anthropic(handler)
    _generate(model=model, temperature=0.2)


def test_anthropic_requires_configured_credentials(mock_anthropic, monkeypatch):
    monkeypatch.setattr(anthropic_provider.settings, "ANTHROPIC_API_KEY", " ")
    with pytest.raises(ProviderConfigurationError, match="not configured"):
        _generate()


@pytest.mark.parametrize("messages, model, temperature", [
    ([GatewayMessage(role="system", content="Be helpful")], "claude-sonnet-5", None),
    ([GatewayMessage(role="assistant", content="Hello")], "claude-sonnet-4-6", None),
    ([GatewayMessage(role="assistant", content="Hello")], "claude-fable-5-1", None),
    ([GatewayMessage(role="user", content="Hello")], "claude-haiku-4-5-20251001", 1.5),
])
def test_anthropic_invalid_message_or_sampling_fails_before_http(mock_anthropic, messages, model, temperature):
    def handler(request):
        pytest.fail("Invalid Anthropic inputs must fail before HTTP")

    mock_anthropic(handler)
    with pytest.raises(ProviderFailure) as caught:
        _generate(messages=messages, model=model, temperature=temperature)
    assert caught.value.code == "provider_error"


@pytest.mark.parametrize("status, error_type, code, retryable", [
    (400, "invalid_request_error", "provider_error", False),
    (401, "authentication_error", "provider_auth_error", False),
    (403, "permission_error", "provider_auth_error", False),
    (404, "not_found_error", "provider_model_unavailable", False),
    (409, "conflict_error", "provider_error", False),
    (413, "request_too_large", "provider_error", False),
    (429, "rate_limit_error", "provider_rate_limited", True),
    (500, "api_error", "provider_unavailable", True),
    (504, "timeout_error", "provider_timeout", True),
    (529, "overloaded_error", "provider_unavailable", True),
    (200, "overloaded_error", "provider_unavailable", True),
])
def test_anthropic_maps_error_types_without_exposing_payload(mock_anthropic, status, error_type, code, retryable):
    mock_anthropic(lambda request: httpx.Response(status, json={
        "type": "error", "error": {"type": error_type, "message": "private request and credentials"},
        "request_id": "private-request-id",
    }))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is retryable
    assert "private" not in caught.value.message


@pytest.mark.parametrize("exception, code", [
    (httpx.ReadTimeout("private request"), "provider_timeout"),
    (httpx.ConnectError("private request"), "provider_unavailable"),
])
def test_anthropic_maps_network_errors(mock_anthropic, exception, code):
    def handler(request):
        raise exception

    mock_anthropic(handler)
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is True
    assert "private" not in caught.value.message


@pytest.mark.parametrize("status, code", [(200, "provider_error"), (401, "provider_auth_error"), (529, "provider_unavailable")])
def test_anthropic_non_json_responses_are_safe(mock_anthropic, status, code):
    mock_anthropic(lambda request: httpx.Response(status, text="<html>private upstream failure</html>"))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code


def test_anthropic_preserves_zero_usage(mock_anthropic):
    mock_anthropic(lambda request: _success(usage={"input_tokens": 0, "output_tokens": 0}))
    result = _generate()
    assert result.usage.total_tokens == 0
    assert result.usage.estimated is False


def test_anthropic_estimates_only_missing_usage(mock_anthropic):
    mock_anthropic(lambda request: _success(usage={"input_tokens": 12}))
    result = _generate()
    assert result.usage.input_tokens == 12
    assert result.usage.output_tokens == 2
    assert result.usage.total_tokens == 14
    assert result.usage.estimated is True


def test_anthropic_invalid_usage_returns_safe_error(mock_anthropic):
    mock_anthropic(lambda request: _success(usage={"input_tokens": "private-invalid", "output_tokens": 2}))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == "provider_error"
    assert "private" not in caught.value.message
