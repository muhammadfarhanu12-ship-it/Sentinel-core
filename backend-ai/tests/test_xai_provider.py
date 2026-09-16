from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.schemas.gateway_schema import GatewayMessage
from app.services.ai_providers import xai_provider
from app.services.ai_providers.base import ProviderConfigurationError, ProviderFailure


MESSAGES = [
    GatewayMessage(role="system", content="Be concise."),
    GatewayMessage(role="user", content="Hello"),
    GatewayMessage(role="assistant", content="Hi"),
    GatewayMessage(role="user", content="Continue"),
]


@pytest.fixture
def mock_xai(monkeypatch):
    monkeypatch.setattr(
        xai_provider,
        "settings",
        SimpleNamespace(XAI_API_KEY="test-xai-key", AI_PROVIDER_TIMEOUT_SECONDS=12.0),
    )
    original_client = httpx.AsyncClient

    def install(handler):
        monkeypatch.setattr(
            xai_provider.httpx,
            "AsyncClient",
            lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
        )

    return install


def _generate(**kwargs):
    return asyncio.run(xai_provider.XAIProvider().generate(messages=MESSAGES, model="grok-4.6", **kwargs))


def test_xai_request_and_actual_usage(mock_xai):
    def handler(request):
        assert request.method == "POST"
        assert str(request.url) == "https://api.x.ai/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-xai-key"
        assert request.headers["Content-Type"] == "application/json"
        assert request.extensions["timeout"]["read"] == 12.0
        assert json.loads(request.content) == {
            "model": "grok-4.6",
            "messages": [{"role": item.role, "content": item.content} for item in MESSAGES],
            "temperature": 0,
            "max_tokens": 500,
        }
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "  Hello there.  "}, "finish_reason": "stop"}],
            "usage": {
                "prompt_tokens": 32,
                "completion_tokens": 9,
                "total_tokens": 135,
                "completion_tokens_details": {"reasoning_tokens": 94},
            },
        })

    mock_xai(handler)
    result = _generate(temperature=0, max_tokens=500)
    assert result.provider == "xai"
    assert result.model == "grok-4.6"
    assert result.content == "Hello there."
    assert result.usage.input_tokens == 32
    assert result.usage.output_tokens == 9
    assert result.usage.total_tokens == 135
    assert result.usage.estimated is False
    assert result.raw_metadata == {"finish_reason": "stop"}


@pytest.mark.parametrize("usage,expected,estimated", [
    ({"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, (0, 0, 0), False),
    ({"prompt_tokens": 5, "completion_tokens": 0}, (5, 0, 5), True),
    (None, (8, 1, 9), True),
])
def test_xai_usage_preserves_zero_and_estimates_only_missing_counts(mock_xai, usage, expected, estimated):
    def handler(request):
        assert "temperature" not in json.loads(request.content)
        assert "max_tokens" not in json.loads(request.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "Hi"}, "finish_reason": "stop"}],
            "usage": usage,
        })

    mock_xai(handler)
    result = _generate()
    assert (result.usage.input_tokens, result.usage.output_tokens, result.usage.total_tokens) == expected
    assert result.usage.estimated is estimated


@pytest.mark.parametrize("status,payload,code,retryable", [
    (400, {"code": "Client specified an invalid argument", "error": "Incorrect API key provided: secret-value"}, "provider_auth_error", False),
    (400, {"error": {"message": "Invalid API key: secret-value"}}, "provider_auth_error", False),
    (400, {"error": "The model does not exist: secret-value"}, "provider_model_unavailable", False),
    (403, {"error": "Your team does not have access to model secret-value"}, "provider_model_unavailable", False),
    (401, {"error": "secret-value"}, "provider_auth_error", False),
    (403, {"error": "secret-value"}, "provider_auth_error", False),
    (404, {"error": "secret-value"}, "provider_model_unavailable", False),
    (408, {"error": "secret-value"}, "provider_timeout", True),
    (429, {"error": "secret-value"}, "provider_rate_limited", True),
    (503, {"error": "secret-value"}, "provider_unavailable", True),
    (400, {"error": "Invalid temperature: secret-value"}, "provider_error", False),
    (422, {"error": ["secret-value"]}, "provider_error", False),
    (400, ["secret-value"], "provider_error", False),
])
def test_xai_errors_are_normalized_and_safe(mock_xai, caplog, status, payload, code, retryable):
    mock_xai(lambda _request: httpx.Response(status, json=payload))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is retryable
    assert "secret-value" not in caught.value.message
    assert "secret-value" not in caplog.text


@pytest.mark.parametrize("exception,code", [
    (httpx.ReadTimeout, "provider_timeout"),
    (httpx.ConnectError, "provider_unavailable"),
])
def test_xai_transport_failures(mock_xai, exception, code):
    def handler(request):
        raise exception("private transport details", request=request)

    mock_xai(handler)
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == code
    assert caught.value.retryable is True
    assert "private" not in caught.value.message


@pytest.mark.parametrize("status,body", [(400, b"not JSON"), (200, b"not JSON"), (200, b"{}"), (200, b'{"choices": []}')])
def test_xai_invalid_response_is_safe(mock_xai, status, body):
    mock_xai(lambda _request: httpx.Response(status, content=body))
    with pytest.raises(ProviderFailure) as caught:
        _generate()
    assert caught.value.code == "provider_error"


def test_xai_missing_configuration_does_not_send_request(mock_xai, monkeypatch):
    monkeypatch.setattr(xai_provider.settings, "XAI_API_KEY", "   ")

    def handler(_request):
        pytest.fail("Unconfigured provider must not make an HTTP request")

    mock_xai(handler)
    with pytest.raises(ProviderConfigurationError, match="not configured"):
        _generate()
