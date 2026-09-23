from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.middleware import rate_limiter
from app.routers import contact_router
from app.services import contact_email_service, email_service
from app.services.email_service import EmailSendResult


PAYLOAD = {
    "firstName": " Ada ",
    "lastName": " Lovelace ",
    "email": "ada@example.com",
    "company": " Analytical Engines ",
    "message": " Please help with our AI security. ",
}


@pytest.fixture
def contact_client(monkeypatch):
    monkeypatch.setattr(rate_limiter, "limiter", rate_limiter.RateLimiter())
    sender = AsyncMock(return_value=EmailSendResult(success=True, message_id="contact-test"))
    monkeypatch.setattr(contact_router, "send_contact_email_async", sender)
    # No lifespan context: this public endpoint needs neither Mongo nor startup services.
    client = TestClient(app)
    yield client, sender
    client.close()


def test_contact_is_public_and_sends_trimmed_fields(contact_client):
    client, sender = contact_client
    response = client.post("/api/v1/contact", json=PAYLOAD)

    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    assert response.json()["data"]["message"] == "Thanks, we'll get back to you shortly"
    sender.assert_awaited_once_with(
        first_name="Ada", last_name="Lovelace", email="ada@example.com",
        company="Analytical Engines", message="Please help with our AI security.",
    )


def test_contact_company_is_optional(contact_client):
    client, sender = contact_client
    payload = {key: value for key, value in PAYLOAD.items() if key != "company"}
    response = client.post("/api/v1/contact", json=payload)

    assert response.status_code == 200, response.text
    assert sender.await_args.kwargs["company"] is None


@pytest.mark.parametrize("field,value", [
    ("firstName", "  "), ("lastName", "\n\t"), ("message", "   "),
    ("email", "not-an-email"), ("email", "ada@example.com\r\nBcc: spam@example.com"),
    ("firstName", "x" * 101), ("lastName", "x" * 101),
    ("company", "x" * 201), ("message", "x" * 5001),
    ("email", "x" * 245 + "@example.com"),
    ("message", None), ("firstName", 123),
])
def test_contact_rejects_invalid_fields_before_email(contact_client, field, value):
    client, sender = contact_client
    response = client.post("/api/v1/contact", json={**PAYLOAD, field: value})

    assert response.status_code == 422, response.text
    sender.assert_not_awaited()


@pytest.mark.parametrize("field", ["firstName", "lastName", "email", "message"])
def test_contact_requires_identity_and_message(contact_client, field):
    client, sender = contact_client
    response = client.post("/api/v1/contact", json={key: value for key, value in PAYLOAD.items() if key != field})

    assert response.status_code == 422, response.text
    sender.assert_not_awaited()


def test_contact_delivery_failure_is_not_reported_as_success(contact_client):
    client, sender = contact_client
    sender.return_value = EmailSendResult(success=False, error="SMTP credentials are invalid")
    response = client.post("/api/v1/contact", json=PAYLOAD)

    assert response.status_code == 502
    assert response.json()["success"] is False
    assert "support@mefyx.com" in response.json()["error"]["message"]
    assert "SMTP credentials" not in response.text


def test_contact_limits_attempts_for_fifteen_minutes_and_ignores_spoofed_headers(contact_client, monkeypatch):
    client, sender = contact_client
    now = [1000.0]
    monkeypatch.setattr(rate_limiter, "time", SimpleNamespace(time=lambda: now[0]))
    for _ in range(5):
        assert client.post("/api/v1/contact", json=PAYLOAD).status_code == 200

    response = client.post("/api/v1/contact", json=PAYLOAD, headers={"X-Forwarded-For": "203.0.113.42"})
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "900"
    assert sender.await_count == 5

    async def submit_from_other_ip():
        transport = httpx.ASGITransport(app=app, client=("203.0.113.43", 1234))
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as other_client:
            return await other_client.post("/api/v1/contact", json=PAYLOAD)

    assert asyncio.run(submit_from_other_ip()).status_code == 200
    now[0] += 900
    assert client.post("/api/v1/contact", json=PAYLOAD).status_code == 200
    assert sender.await_count == 7


@pytest.mark.parametrize("invalid", [False, True])
def test_contact_failed_attempts_also_consume_rate_limit(contact_client, invalid):
    client, sender = contact_client
    sender.return_value = EmailSendResult(success=False, error="SMTP unavailable")
    payload = {**PAYLOAD, "message": " "} if invalid else PAYLOAD
    for _ in range(5):
        assert client.post("/api/v1/contact", json=payload).status_code == (422 if invalid else 502)
    assert client.post("/api/v1/contact", json=PAYLOAD).status_code == 429
    assert sender.await_count == (0 if invalid else 5)


@pytest.fixture
def smtp_server(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USERNAME", "mailer@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "test-only")
    monkeypatch.setattr(settings, "REMEDIATION_EMAIL_FROM", "Mefyx <mailer@example.com>")
    connection = MagicMock()
    monkeypatch.setattr(email_service, "_open_smtp_connection", connection)
    return connection.return_value.__enter__.return_value


def test_contact_email_uses_support_recipient_reply_to_and_escaped_content(smtp_server):
    result = asyncio.run(contact_email_service.send_contact_email_async(
        first_name="Ada <script>", last_name="Lovelace", email="ada@example.com",
        company="Engines & Co.", message="First line\n<script>alert('test')</script>",
    ))

    assert result.success is True
    message = smtp_server.send_message.call_args.args[0]
    assert str(message["From"]) == "Mefyx <mailer@example.com>"
    assert str(message["To"]) == "support@mefyx.com"
    assert str(message["Reply-To"]) == "ada@example.com"
    assert str(message["Subject"]) == "New contact form submission"
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "Name: Ada <script> Lovelace" in plain
    assert "Email: ada@example.com" in plain
    assert "Company: Engines & Co." in plain
    assert "First line\n<script>" in plain
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "Engines &amp; Co." in html


def test_reply_to_header_injection_is_rejected(smtp_server):
    result = email_service.send_email(
        to="support@mefyx.com", subject="Contact", html="<p>Hi</p>",
        reply_to="ada@example.com\r\nBcc: spam@example.com",
    )

    assert result.success is False
    smtp_server.send_message.assert_not_called()


def test_existing_email_callers_do_not_gain_reply_to(smtp_server):
    result = email_service.send_verification_email(recipient_email="ada@example.com", token="test-token")

    assert result.success is True
    message = smtp_server.send_message.call_args.args[0]
    assert str(message["To"]) == "ada@example.com"
    assert message["Reply-To"] is None
