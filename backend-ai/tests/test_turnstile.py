from __future__ import annotations

import asyncio
import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.main as main_module
from app.admin import admin_router
from app.core.config import settings
from app.main import app
from app.middleware import rate_limiter
from app.routes import auth_routes
from app.routers import contact_router
from app.schemas.contact_schema import ContactRequest
from app.schemas.user_schema import LoginRequest, SignupRequest, UserResponse
from app.services import turnstile_service
from app.services.email_service import EmailSendResult


AUTH_ROUTES = [
    (f"{prefix}/auth/{path}", action)
    for prefix in ("/api", "/api/v1")
    for path, action in (
        ("signup", "signup"), ("login", "login"),
        ("forgot-password", "forgot_password"), ("reset-password", "reset_password"),
        ("resend-verification", "resend_verification"),
    )
] + [
    (f"{prefix}/admin/{path}", action)
    for prefix in ("/api", "/api/v1")
    for path, action in (
        ("login", "admin_login"), ("auth/login", "admin_login"),
        ("forgot-password", "admin_forgot_password"), ("reset-password", "admin_reset_password"),
        ("request-access", "admin_request_access"),
    )
]

CONTACT_PAYLOAD = {
    "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com", "message": "Hello",
}
AUTH_PAYLOADS = {
    "signup": {"email": "ada@example.com", "password": "StrongPass123"},
    "login": {"email": "ada@example.com", "password": "StrongPass123"},
    "forgot_password": {"email": "ada@example.com"},
    "reset_password": {"token": "r" * 32, "new_password": "NewStrongPass123"},
    "resend_verification": {"email": "ada@example.com"},
    "admin_login": {"email": "ada@example.com", "password": "StrongPass123"},
    "admin_forgot_password": {"email": "ada@example.com"},
    "admin_reset_password": {"token": "r" * 32, "new_password": "NewStrongPass123"},
    "admin_request_access": {"email": "ada@example.com", "reason": "Manage organization"},
}


@pytest.fixture
def protection_client(monkeypatch, turnstile_transport):
    monkeypatch.setattr(rate_limiter, "limiter", rate_limiter.RateLimiter())
    monkeypatch.setattr(main_module, "wait_for_mongo_ready", AsyncMock())
    side_effects = {}
    for action, name, result in (
        ("signup", "create_user", SimpleNamespace(user=SimpleNamespace(email="ada@example.com"))),
        ("login", "authenticate_user", {"_id": "test-user", "email": "ada@example.com", "is_verified": True}),
        ("forgot_password", "issue_password_reset_token", None),
        ("resend_verification", "resend_verification_email", SimpleNamespace(message="Verification email sent.", email_sent=True)),
        ("reset_password", "reset_password_for_user", None),
    ):
        spy = AsyncMock(return_value=result)
        monkeypatch.setattr(auth_routes, name, spy)
        side_effects[action] = spy
    monkeypatch.setattr(auth_routes, "_record_auth_audit_event", AsyncMock())
    monkeypatch.setattr(auth_routes, "create_refresh_session", AsyncMock(return_value="refresh-token"))
    email = AsyncMock(return_value=EmailSendResult(success=True))
    monkeypatch.setattr(contact_router, "send_contact_email_async", email)
    side_effects["contact"] = email
    service = SimpleNamespace()
    for action, name, result in (
        ("admin_login", "login", {"access_token": "admin-token"}),
        ("admin_forgot_password", "request_password_reset", {"message": "Reset email sent."}),
        ("admin_reset_password", "reset_password", {"message": "Password reset completed."}),
        ("admin_request_access", "request_access", {"message": "Access request submitted."}),
    ):
        spy = AsyncMock(return_value=result)
        setattr(service, name, spy)
        side_effects[action] = spy
    app.dependency_overrides[admin_router.get_admin_service] = lambda: service
    # Do not enter lifespan: no real database/startup services are needed here.
    client = TestClient(app)
    try:
        yield client, side_effects
    finally:
        client.close()
        app.dependency_overrides.pop(admin_router.get_admin_service, None)


@pytest.mark.parametrize("path,action", AUTH_ROUTES)
def test_authentication_routes_and_aliases_work_without_captcha(protection_client, turnstile_transport, path, action):
    client, effects = protection_client
    # A Cloudflare outage cannot affect authentication, since it is never called.
    turnstile_transport.response = httpx.ConnectError("network unavailable")
    response = client.post(path, json=AUTH_PAYLOADS[action])
    assert response.status_code == (201 if action in {"signup", "admin_request_access"} else 200), response.text
    assert response.json()["success"] is True
    effects[action].assert_awaited_once()
    assert turnstile_transport.requests == []


@pytest.mark.parametrize("prefix", ["/api", "/api/v1"])
@pytest.mark.parametrize("field", ["username", "email"])
def test_form_login_without_captcha(protection_client, turnstile_transport, prefix, field):
    client, effects = protection_client
    turnstile_transport.response = httpx.ConnectError("network unavailable")
    response = client.post(f"{prefix}/auth/login", data={field: "ada@example.com", "password": "StrongPass123"})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["access_token"]
    effects["login"].assert_awaited_once_with("ada@example.com", "StrongPass123")
    assert turnstile_transport.requests == []


@pytest.mark.parametrize("failure", ["missing", "invalid", "expired", "outage"])
def test_contact_rejection_prevents_email(protection_client, turnstile_transport, failure):
    client, effects = protection_client
    payload = {**CONTACT_PAYLOAD}
    if failure != "missing":
        payload["turnstile_token"] = "contact:candidate"
    if failure in {"invalid", "expired"}:
        turnstile_transport.response = httpx.Response(200, json={
            "success": False, "error-codes": ["timeout-or-duplicate" if failure == "expired" else "invalid-input-response"],
        })
    if failure == "outage":
        turnstile_transport.response = httpx.ConnectError("network unavailable")
    response = client.post("/api/v1/contact", json=payload)
    assert response.status_code == (503 if failure == "outage" else 400), response.text
    for effect in effects.values():
        effect.assert_not_awaited()
    assert len(turnstile_transport.requests) == (0 if failure == "missing" else 1)


@pytest.mark.parametrize("token", [None, "", "  ", 42, True, [], {}, "x" * 2049])
def test_missing_and_malformed_tokens_never_call_cloudflare(turnstile_transport, token):
    with pytest.raises(HTTPException) as error:
        asyncio.run(turnstile_service.verify_turnstile(token, action="contact"))
    assert error.value.status_code == 400
    assert turnstile_transport.requests == []


@pytest.mark.parametrize("result,status", [
    ({"success": True, "hostname": "mefyx.com", "action": "wrong-action"}, 400),
    ({"success": True, "hostname": "evil.mefyx.com", "action": "contact"}, 400),
    ({"success": True, "hostname": "mefyx.com.attacker.example", "action": "contact"}, 400),
    ({"success": True, "action": "contact"}, 400),
    ({"success": True, "hostname": "mefyx.com"}, 400),
    ({"success": "true", "hostname": "mefyx.com", "action": "contact"}, 503),
    ({}, 503), ([], 503),
    ({"success": False, "error-codes": ["invalid-input-secret"]}, 503),
    ({"success": False, "error-codes": ["internal-error"]}, 503),
])
def test_hostname_action_and_response_validation(turnstile_transport, result, status):
    turnstile_transport.response = httpx.Response(200, json=result)
    with pytest.raises(HTTPException) as error:
        asyncio.run(turnstile_service.verify_turnstile("candidate", action="contact"))
    assert error.value.status_code == status


@pytest.mark.parametrize("response", [
    httpx.Response(503), httpx.Response(302, headers={"Location": "https://attacker.example/"}),
    httpx.Response(200, text="invalid JSON"), httpx.ReadTimeout("timeout"),
])
def test_http_failures_and_redirects_fail_closed_without_retries(turnstile_transport, response):
    turnstile_transport.response = response
    with pytest.raises(HTTPException) as error:
        asyncio.run(turnstile_service.verify_turnstile("candidate", action="contact"))
    assert error.value.status_code == 503
    assert len(turnstile_transport.requests) == 1


def test_real_verifier_sends_server_secret_only_to_cloudflare(turnstile_transport):
    asyncio.run(turnstile_service.verify_turnstile("contact:fresh", action="contact"))
    request = turnstile_transport.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    assert parse_qs(request.content.decode()) == {
        "secret": ["unit-test-only-server-credential"], "response": ["contact:fresh"],
    }


def test_duplicate_token_rejected_and_email_not_resent(protection_client, turnstile_transport):
    client, effects = protection_client
    payload = {
        "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com",
        "message": "Hello", "turnstile_token": "contact:single-use",
    }
    assert client.post("/api/v1/contact", json=payload).status_code == 200
    assert client.post("/api/v1/contact", json=payload).status_code == 400
    effects["contact"].assert_awaited_once()


def test_invalid_signup_attempts_are_limited_across_aliases_and_spoofed_headers(protection_client, turnstile_transport):
    client, effects = protection_client
    for attempt in range(5):
        assert client.post("/api/auth/signup", json={}, headers={"X-Forwarded-For": f"203.0.113.{attempt}"}).status_code == 422
    response = client.post("/api/v1/auth/signup", json={}, headers={"X-Forwarded-For": "198.51.100.1"})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert turnstile_transport.requests == []
    for effect in effects.values():
        effect.assert_not_awaited()


def test_form_login_account_limit_uses_username_even_when_email_field_is_supplied(protection_client):
    _, effects = protection_client
    effects["login"].side_effect = HTTPException(401, "Invalid email or password.")

    async def attempts():
        responses = []
        for attempt in range(6):
            transport = httpx.ASGITransport(app=app, client=(f"203.0.113.{attempt}", 1234))
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                responses.append(await client.post("/api/v1/auth/login", data={
                    "username": "victim@example.com", "email": f"attacker{attempt}@example.com", "password": "bad",
                }))
        return responses

    responses = asyncio.run(attempts())
    assert [response.status_code for response in responses] == [401] * 5 + [429]
    assert effects["login"].await_count == 5


@pytest.mark.parametrize("field", ["TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES"])
def test_incomplete_server_config_cannot_accept_tokens(monkeypatch, turnstile_transport, field):
    monkeypatch.setattr(settings, field, "")
    with pytest.raises(HTTPException) as error:
        asyncio.run(turnstile_service.verify_turnstile("contact:fresh", action="contact"))
    assert error.value.status_code == 503
    assert turnstile_transport.requests == []


def test_tokens_are_not_serialized_to_records_or_user_responses():
    payload = ContactRequest(**CONTACT_PAYLOAD, turnstile_token="secret-challenge")
    assert "turnstile_token" not in payload.model_dump()
    assert "secret-challenge" not in repr(payload)
    assert "turnstile_token" not in UserResponse.model_fields
    assert "turnstile_token" not in SignupRequest.model_fields
    assert "turnstile_token" not in LoginRequest.model_fields


def test_production_config_requires_protection(monkeypatch, turnstile_transport):
    config = copy.copy(settings)
    config.APP_ENV = "production"
    config.JWT_SECRET = "j" * 40
    config.API_KEY_SECRET = "k" * 40
    config.CORS_ORIGINS = "https://mefyx.com"
    config.ENABLE_DEMO_MODE = False
    config.AUTH_TEST_FLOW_ENABLED = False
    config.SENTINEL_2FA_ALLOW_DEMO_BYPASS = False
    config.PUBLIC_RATE_LIMIT_BACKEND = "mongo"
    config._validate_values()
    for field, value in (
        ("TURNSTILE_SECRET_KEY", ""), ("TURNSTILE_ALLOWED_HOSTNAMES", ""),
        ("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA"),
        ("PUBLIC_RATE_LIMIT_BACKEND", "memory"),
        ("TURNSTILE_ALLOWED_HOSTNAMES", "https://mefyx.com"),
    ):
        invalid = copy.copy(config)
        setattr(invalid, field, value)
        with pytest.raises(ValueError):
            invalid._validate_values()


def test_cors_errors_and_preflight_remain_readable(protection_client):
    client, _ = protection_client
    origin = main_module.CORS_ALLOWED_ORIGINS[0]
    response = client.options("/api/v1/contact", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    response = client.post("/api/v1/contact", json={}, headers={"Origin": origin})
    assert response.status_code == 400
    assert response.headers["Access-Control-Allow-Origin"] == origin


@pytest.mark.parametrize("path", ["/analyze", "/api/v1/analyze"])
def test_legacy_analyze_requires_auth_before_ai_execution(monkeypatch, path):
    from unittest.mock import Mock
    scanner = Mock()
    monkeypatch.setattr(main_module, "scan_prompt", scanner)
    response = TestClient(app).post(path, json={"prompt": "hello"})
    assert response.status_code == 401
    scanner.assert_not_called()
