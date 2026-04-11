from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models.user import User, UserRoleEnum
from app.services.email_service import EmailSendResult
from app.utils.hashing import get_password_hash


def test_signup_requires_email_verification_before_login(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["recipient_email"] = recipient_email
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-1")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "new.user@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200
    assert signup_res.json()["data"]["message"] == "Check your email for a verification link."
    assert captured["recipient_email"] == "new.user@example.com"

    login_res = client.post(
        "/api/auth/login",
        data={"username": "new.user@example.com", "password": "StrongPass123"},
    )
    assert login_res.status_code == 403
    assert login_res.json()["error"]["message"] == "Please verify your email"


def test_signup_rejects_disposable_email_domains(client):
    response = client.post(
        "/api/auth/signup",
        json={"email": "throwaway@mailinator.com", "password": "StrongPass123"},
    )
    assert response.status_code == 400
    assert "non-disposable email" in response.json()["error"]["message"].lower()


def test_verify_email_marks_user_as_verified_and_clears_token(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-2")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "verify.me@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200

    verify_res = client.get(f"/api/auth/verify-email?token={captured['token']}")
    assert verify_res.status_code == 200
    assert verify_res.json()["data"]["message"] == "Email verified successfully"

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "verify.me@example.com").first()
        assert user is not None
        assert user.is_verified is True
        assert user.verification_token is None
        assert user.verification_token_expiry is None
    finally:
        db.close()


def test_signup_stores_exact_verification_token_and_expiry(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-store-check")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "store.token@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "store.token@example.com").first()
        assert user is not None
        assert user.verification_token == captured["token"]
        assert user.verification_token_expiry is not None
        expiry = user.verification_token_expiry
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        assert expiry > datetime.now(timezone.utc)
    finally:
        db.close()


def test_verify_email_without_token_returns_invalid_token(client):
    response = client.get("/api/auth/verify-email")
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Invalid token"


def test_verify_email_returns_link_expired_for_expired_tokens(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-expired")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    signup_res = client.post(
        "/api/auth/signup",
        json={"email": "expired.verify@example.com", "password": "StrongPass123"},
    )
    assert signup_res.status_code == 200

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "expired.verify@example.com").first()
        assert user is not None
        user.verification_token_expiry = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(user)
        db.commit()
    finally:
        db.close()

    verify_res = client.get(f"/api/auth/verify-email?token={captured['token']}")
    assert verify_res.status_code == 400
    assert verify_res.json()["error"]["message"] == "Link expired"

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "expired.verify@example.com").first()
        assert user is not None
        assert user.is_verified is False
        assert user.verification_token is None
        assert user.verification_token_expiry is None
    finally:
        db.close()


def test_verify_email_rejects_unknown_tokens(client):
    response = client.get("/api/auth/verify-email?token=missing-token")
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Invalid token"


def test_password_reset_updates_password_and_invalidates_old_token(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_password_reset_email_async(*, recipient_email: str, token: str):
        captured["recipient_email"] = recipient_email
        captured["token"] = token
        return EmailSendResult(success=True, message_id="reset-1")

    monkeypatch.setattr("app.services.auth_service.send_password_reset_email_async", fake_send_password_reset_email_async)

    db = SessionLocal()
    try:
        user = User(
            email="reset.user@example.com",
            hashed_password=get_password_hash("OriginalPass123"),
            organization_name="example.com",
            role=UserRoleEnum.ANALYST,
            is_active=True,
            is_verified=True,
            password_updated_at=datetime.now(timezone.utc),
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    forgot_res = client.post("/api/auth/forgot-password", json={"email": "reset.user@example.com"})
    assert forgot_res.status_code == 200
    assert captured["recipient_email"] == "reset.user@example.com"

    reset_res = client.post(
        "/api/auth/reset-password",
        json={"token": captured["token"], "new_password": "UpdatedPass123"},
    )
    assert reset_res.status_code == 200

    second_reset_res = client.post(
        "/api/auth/reset-password",
        json={"token": captured["token"], "new_password": "AnotherPass123"},
    )
    assert second_reset_res.status_code == 400

    login_res = client.post(
        "/api/auth/login",
        data={"username": "reset.user@example.com", "password": "UpdatedPass123"},
    )
    assert login_res.status_code == 200


def test_test_auth_flow_endpoint_runs_end_to_end(client, monkeypatch):
    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        return EmailSendResult(success=True, message_id="verification-test-flow")

    monkeypatch.setattr("app.services.auth_service.send_verification_email_async", fake_send_verification_email_async)

    response = client.post(
        "/api/test-auth-flow",
        json={"email": "flow.user@example.com", "password": "StrongPass123"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    assert payload["status"] == "verified_and_authenticated"
    assert payload["access_token"]


def test_test_email_route_returns_success(client, monkeypatch):
    async def fake_send_test_email_async(*, recipient_email: str):
        assert recipient_email == "ops@example.com"
        return EmailSendResult(success=True, message_id="test-email-1")

    monkeypatch.setattr("app.routers.email_router.send_test_email_async", fake_send_test_email_async)

    response = client.post("/api/test-email", json={"email": "ops@example.com"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["message_id"] == "test-email-1"
