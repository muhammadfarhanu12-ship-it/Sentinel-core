from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.core.database import SessionLocal
from app.middleware.rate_limiter import limiter
from app.models.user import User
from app.services.email_service import EmailSendResult
from app.services.oauth_service import OAuthIdentity


def test_resend_verification_issues_new_token(client, monkeypatch):
    limiter._events.clear()
    captured_tokens: list[str] = []

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured_tokens.append(token)
        return EmailSendResult(success=True, message_id=f"verification-{len(captured_tokens)}")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "resend.me@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200

    resend_res = client.post("/api/auth/resend-verification", json={"email": "resend.me@example.com"})
    assert resend_res.status_code == 200
    assert resend_res.json()["data"]["email_sent"] is True
    assert len(captured_tokens) == 2
    assert captured_tokens[1] != captured_tokens[0]

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "resend.me@example.com").first()
        assert user is not None
        assert user.verification_token == captured_tokens[1]
    finally:
        db.close()


def test_resend_verification_for_verified_user_returns_message(client, monkeypatch):
    limiter._events.clear()
    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        return EmailSendResult(success=True, message_id="verification-verified")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "already.verified@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "already.verified@example.com").first()
        assert user is not None
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expiry = None
        db.add(user)
        db.commit()
    finally:
        db.close()

    resend_res = client.post("/api/auth/resend-verification", json={"email": "already.verified@example.com"})
    assert resend_res.status_code == 200
    assert "already verified" in resend_res.json()["data"]["message"].lower()


def test_google_login_redirects_to_provider(client, monkeypatch):
    limiter._events.clear()
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "google-client-id", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "google-client-secret", raising=False)

    response = client.get("/api/auth/google/login", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/")
    assert "client_id=google-client-id" in location
    assert "state=" in location


def test_google_callback_creates_verified_user_and_redirects_with_tokens(client, monkeypatch):
    limiter._events.clear()
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "google-client-id", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "google-client-secret", raising=False)

    login_response = client.get("/api/auth/google/login", follow_redirects=False)
    state = parse_qs(urlparse(login_response.headers["location"]).query)["state"][0]

    async def fake_exchange_code_for_identity(provider: str, code: str):
        assert provider == "google"
        assert code == "google-code"
        return OAuthIdentity(
            provider="google",
            subject="google-user-123",
            email="oauth.user@example.com",
            email_verified=True,
            name="OAuth User",
        )

    monkeypatch.setattr("app.services.oauth_service.exchange_code_for_identity", fake_exchange_code_for_identity)

    callback_response = client.get(
        f"/api/auth/google/callback?code=google-code&state={state}",
        follow_redirects=False,
    )
    assert callback_response.status_code == 302
    location = callback_response.headers["location"]
    assert location.startswith("http://localhost:5173/oauth/callback#")
    assert "access_token=" in location
    assert "refresh_token=" in location

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "oauth.user@example.com").first()
        assert user is not None
        assert user.is_verified is True
        assert user.oauth_provider == "google"
        assert user.oauth_subject == "google-user-123"
    finally:
        db.close()
