from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import settings
from app.services import contact_email_service, email_service


@pytest.fixture(autouse=True)
def email_settings(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_only")
    monkeypatch.setattr(settings, "EMAIL_FROM_ADDRESS", "Mefyx <noreply@mefyx.com>")
    monkeypatch.setattr(settings, "AUTH_DEBUG_TOKEN_LOGGING", False)


@pytest.fixture(autouse=True)
def resend(monkeypatch):
    """Exercise real HTTP request encoding without any external email delivery."""
    state = SimpleNamespace(requests=[], modes=[], status=200, body={"id": "resend-email-123"}, error=None)
    original_client = httpx.Client
    original_async_client = httpx.AsyncClient

    def handle(request):
        state.requests.append(request)
        if state.error is not None:
            raise state.error("Email transport unavailable", request=request)
        if isinstance(state.body, bytes):
            return httpx.Response(state.status, content=state.body)
        return httpx.Response(state.status, json=state.body)

    def client(*args, **kwargs):
        state.modes.append("sync")
        kwargs["transport"] = httpx.MockTransport(handle)
        return original_client(*args, **kwargs)

    def async_client(*args, **kwargs):
        state.modes.append("async")
        kwargs["transport"] = httpx.MockTransport(handle)
        return original_async_client(*args, **kwargs)

    monkeypatch.setattr(email_service.httpx, "Client", client)
    monkeypatch.setattr(email_service.httpx, "AsyncClient", async_client)
    return state


@pytest.fixture(params=["sync", "async"])
def send(request):
    def call(**kwargs):
        if request.param == "async":
            return asyncio.run(email_service.send_email_async(**kwargs))
        return email_service.send_email(**kwargs)

    return call


def test_resend_request_preserves_payload_and_returns_provider_id(send, resend):
    result = send(
        to=iter(["alice@example.com", "bob@example.com"]),
        subject="Security update",
        html="<p>Your account is secure.</p>",
        text="Your account is secure.",
        reply_to="support@mefyx.com",
    )

    assert result.success is True
    assert result.message_id == "resend-email-123"
    assert result.error is None
    assert len(resend.requests) == 1
    request = resend.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer re_test_only"
    assert request.headers["Content-Type"].startswith("application/json")
    assert json.loads(request.content) == {
        "from": "Mefyx <noreply@mefyx.com>",
        "to": ["alice@example.com", "bob@example.com"],
        "subject": "Security update",
        "html": "<p>Your account is secure.</p>",
        "text": "Your account is secure.",
        "reply_to": "support@mefyx.com",
    }


def test_single_recipient_is_an_array_and_reply_to_is_optional(send, resend):
    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is True
    payload = json.loads(resend.requests[0].content)
    assert payload["to"] == ["alice@example.com"]
    assert "reply_to" not in payload


@pytest.mark.parametrize("status,name,message", [
    (401, "validation_error", "API key is invalid"),
    (403, "validation_error", "The mefyx.com domain is not verified"),
    (429, "rate_limit_exceeded", "Too many requests"),
    (503, "application_error", "Email service is unavailable"),
])
def test_provider_rejection_returns_failed_result(send, resend, status, name, message):
    resend.status = status
    resend.body = {"name": name, "message": message}

    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert result.message_id is None
    assert name in result.error
    assert message in result.error
    assert len(resend.requests) == 1


def test_non_json_provider_failure_returns_failed_result(send, resend):
    resend.status = 502
    resend.body = b"<html>Bad gateway</html>"

    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert result.message_id is None
    assert result.error


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
def test_transport_failure_returns_failed_result(send, resend, error):
    resend.error = error

    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert result.message_id is None
    assert result.error
    assert len(resend.requests) == 1


@pytest.mark.parametrize("body", [b"not-json", {}, {"id": ""}, {"id": None}, []])
def test_invalid_success_response_is_not_reported_as_delivery(send, resend, body):
    resend.body = body

    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert result.message_id is None
    assert result.error


@pytest.mark.parametrize("setting", ["RESEND_API_KEY", "EMAIL_FROM_ADDRESS"])
@pytest.mark.parametrize("value", [None, "   "])
def test_missing_configuration_fails_before_http(send, resend, monkeypatch, setting, value):
    monkeypatch.setattr(settings, setting, value)

    result = send(to="alice@example.com", subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert setting in result.error
    assert resend.requests == []


@pytest.mark.parametrize("field", ["to", "subject", "reply_to", "from"])
def test_header_injection_fails_before_http(send, resend, monkeypatch, field):
    arguments = {"to": "alice@example.com", "subject": "Hello", "html": "<p>Hello</p>"}
    injected = "alice@example.com\r\nBcc: attacker@example.com"
    if field == "from":
        monkeypatch.setattr(settings, "EMAIL_FROM_ADDRESS", injected)
    else:
        arguments[field] = injected

    result = send(**arguments)

    assert result.success is False
    assert "control characters" in result.error
    assert resend.requests == []


def test_empty_recipients_fail_before_http(send, resend):
    result = send(to=[], subject="Hello", html="<p>Hello</p>")

    assert result.success is False
    assert "recipient" in result.error.lower()
    assert resend.requests == []


@pytest.mark.parametrize("flow,subject,path,expiry_setting", [
    ("verification", "Verify your Mefyx AI account", "verify-email", "EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES"),
    ("password_reset", "Reset your Mefyx AI password", "reset-password", "PASSWORD_RESET_TOKEN_EXPIRE_MINUTES"),
])
@pytest.mark.parametrize("use_async", [False, True])
def test_auth_email_content_and_links_are_preserved(
    resend, monkeypatch, flow, subject, path, expiry_setting, use_async,
):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://mefyx.com/")
    monkeypatch.setattr(settings, "AUTH_VERIFY_EMAIL_PATH", "/verify-email")
    monkeypatch.setattr(settings, "AUTH_RESET_PASSWORD_PATH", "/reset-password")
    monkeypatch.setattr(settings, expiry_setting, 23)
    sender = getattr(email_service, f"send_{flow}_email{'_async' if use_async else ''}")
    result = sender(recipient_email="alice@example.com", token="token+/with?reserved&chars")
    if use_async:
        result = asyncio.run(result)

    assert result.success is True
    assert resend.modes == ["async" if use_async else "sync"]
    payload = json.loads(resend.requests[0].content)
    assert payload["from"] == "Mefyx <noreply@mefyx.com>"
    assert payload["to"] == ["alice@example.com"]
    assert payload["subject"] == subject
    assert "reply_to" not in payload
    expected_link = f"https://mefyx.com/{path}?token=token%2B%2Fwith%3Freserved%26chars"
    for part in (payload["html"], payload["text"]):
        assert expected_link in part
        assert "alice@example.com" in part
        assert "23 minutes" in part


def test_async_contact_email_uses_support_and_preserves_escaped_content(resend):
    result = asyncio.run(contact_email_service.send_contact_email_async(
        first_name="Ada <script>", last_name="Lovelace", email="ada@example.com",
        company="Engines & Co.", message="First line\n<script>alert('test')</script>",
    ))

    assert result.success is True
    assert result.message_id == "resend-email-123"
    assert resend.modes == ["async"]
    payload = json.loads(resend.requests[0].content)
    assert payload["from"] == "Mefyx <noreply@mefyx.com>"
    assert payload["to"] == ["support@mefyx.com"]
    assert payload["reply_to"] == "ada@example.com"
    assert payload["subject"] == "New contact form submission"
    assert "Name: Ada <script> Lovelace" in payload["text"]
    assert "Company: Engines & Co." in payload["text"]
    assert "First line\n<script>" in payload["text"]
    assert "<script>" not in payload["html"]
    assert "&lt;script&gt;" in payload["html"]
    assert "Engines &amp; Co." in payload["html"]


@pytest.mark.parametrize("flow", ["verification", "password_reset", "contact"])
def test_all_async_user_email_flows_return_provider_failures(resend, flow):
    resend.status = 403
    resend.body = {"name": "validation_error", "message": "Sending domain is not verified"}
    if flow == "contact":
        result = asyncio.run(contact_email_service.send_contact_email_async(
            first_name="Ada", last_name="Lovelace", email="ada@example.com", message="Please help",
        ))
    else:
        sender = getattr(email_service, f"send_{flow}_email_async")
        result = asyncio.run(sender(recipient_email="ada@example.com", token="test-token"))

    assert result.success is False
    assert "Sending domain is not verified" in result.error
    assert result.message_id is None
    assert resend.modes == ["async"]
