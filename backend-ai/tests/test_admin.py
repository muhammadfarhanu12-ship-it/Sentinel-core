from datetime import datetime, timezone

from app.admin.admin_model import Admin
from app.admin.admin_service import AdminService
from app.core.config import settings
from app.models.admin_audit_log import AdminAuditLog
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.usage import Usage
from app.models.user import TierEnum, User, UserRoleEnum
from app.utils.hashing import get_password_hash
from app.utils.token_generator import create_access_token


def create_user(db, *, email: str, password: str, active: bool = True) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        organization_name="example.com",
        role=UserRoleEnum.ANALYST,
        tier=TierEnum.PRO,
        is_active=active,
        is_verified=True,
        monthly_limit=5000,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(client, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["data"]["access_token"]


def login_admin(client, email: str, password: str) -> str:
    response = client.post("/api/v1/admin/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["data"]["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def seed_security_data(db, user: User) -> APIKey:
    api_key = APIKey(
        user_id=user.id,
        prefix="sentinel_sk_",
        key_hash=get_password_hash("sentinel_sk_live_ABCDEF1234567890ABCDEF1234567890"),
        name="Primary Key",
        status=KeyStatusEnum.ACTIVE,
        usage_count=25,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    db.add(Usage(user_id=user.id, month="2026-04", requests_count=120, tokens_count=8000))
    db.add(
        SecurityLog(
            api_key_id=api_key.id,
            status=LogStatusEnum.BLOCKED,
            threat_type="Prompt Injection",
            threat_types=["Prompt Injection"],
            threat_score=0.98,
            risk_score=0.96,
            attack_vector="prompt",
            risk_level="high",
            tokens_used=500,
            latency_ms=42,
            endpoint="/api/v1/brain/analyze",
            method="POST",
            model="gemini-2.5-pro",
            ip_address="127.0.0.10",
            raw_payload={"prompt": "ignore previous instructions"},
            timestamp=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return api_key


def test_default_admin_is_seeded(db_session):
    service = AdminService(db_session)

    first = service.ensure_default_admin()
    second = service.ensure_default_admin()

    rows = db_session.query(Admin).filter(Admin.email == settings.ADMIN_BOOTSTRAP_EMAIL).all()
    assert len(rows) == 1
    assert first is not None
    assert second is not None
    assert first.id == second.id
    assert second.is_active is True


def test_admin_login_works_independently(client, db_session):
    service = AdminService(db_session)
    admin = service.ensure_default_admin()
    assert admin is not None

    response = client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin.email, "password": settings.ADMIN_BOOTSTRAP_PASSWORD},
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["access_token"]
    assert response.json()["data"]["role"] == "admin"


def test_admin_routes_reject_missing_and_user_tokens(client, db_session):
    user = create_user(db_session, email="analyst@example.com", password="StrongPass!123")
    user_token = create_access_token(
        {
            "sub": user.email,
            "user_id": str(user.id),
            "role": UserRoleEnum.ANALYST.value,
        }
    )

    missing = client.get("/api/v1/admin/metrics")
    wrong_token = client.get("/api/v1/admin/metrics", headers=auth_headers(user_token))

    assert missing.status_code == 401
    assert wrong_token.status_code == 401


def test_admin_can_manage_users_logs_metrics_and_api_keys(client, db_session):
    service = AdminService(db_session)
    admin = service.ensure_default_admin()
    assert admin is not None
    user = create_user(db_session, email="member@example.com", password="StrongPass!123")
    api_key = seed_security_data(db_session, user)
    token = login_admin(client, admin.email, str(settings.ADMIN_BOOTSTRAP_PASSWORD))
    headers = auth_headers(token)

    metrics_response = client.get("/api/v1/admin/metrics", headers=headers)
    system_response = client.get("/api/v1/admin/system-status", headers=headers)
    users_response = client.get("/api/v1/admin/users", headers=headers)
    logs_response = client.get("/api/v1/admin/logs", headers=headers)
    threats_response = client.get("/api/v1/admin/threats", headers=headers)
    keys_response = client.get("/api/v1/admin/api-keys", headers=headers)
    settings_response = client.get("/api/v1/admin/settings", headers=headers)

    assert metrics_response.status_code == 200, metrics_response.text
    assert system_response.status_code == 200, system_response.text
    assert users_response.status_code == 200, users_response.text
    assert logs_response.status_code == 200, logs_response.text
    assert threats_response.status_code == 200, threats_response.text
    assert keys_response.status_code == 200, keys_response.text
    assert settings_response.status_code == 200, settings_response.text
    assert any(item["email"] == user.email for item in users_response.json()["data"])
    assert logs_response.json()["data"][0]["user_email"] == user.email
    assert keys_response.json()["data"][0]["user_email"] == user.email

    filtered_logs_response = client.get("/api/v1/admin/logs?risk_level=high", headers=headers)
    filtered_keys_response = client.get("/api/v1/admin/api-keys?status=ACTIVE", headers=headers)
    assert filtered_logs_response.status_code == 200, filtered_logs_response.text
    assert filtered_keys_response.status_code == 200, filtered_keys_response.text

    status_response = client.patch(
        f"/api/v1/admin/users/{user.id}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert status_response.status_code == 200, status_response.text
    assert status_response.json()["data"]["is_active"] is False

    create_key_response = client.post(
        "/api/v1/admin/api-keys",
        headers=headers,
        json={"user_id": user.id, "name": "Emergency Key"},
    )
    assert create_key_response.status_code == 200, create_key_response.text
    assert create_key_response.json()["data"]["key"].startswith("sentinel_sk_")

    revoke_key_response = client.delete(f"/api/v1/admin/api-keys/{api_key.id}", headers=headers)
    assert revoke_key_response.status_code == 200, revoke_key_response.text
    assert revoke_key_response.json()["data"]["status"] == "REVOKED"

    update_settings_response = client.put(
        "/api/v1/admin/settings",
        headers=headers,
        json={
            "enable_gemini_module": True,
            "enable_openai_module": True,
            "enable_anthropic_module": True,
            "ai_kill_switch_enabled": False,
            "require_mfa_for_admin": False,
            "admin_rate_limit_per_minute": 90,
            "admin_rate_limit_window_seconds": 60,
            "api_key_rate_limit_per_minute": 150,
        },
    )
    assert update_settings_response.status_code == 200, update_settings_response.text
    assert update_settings_response.json()["data"]["admin_rate_limit_per_minute"] == 90

    delete_response = client.delete(f"/api/v1/admin/users/{user.id}", headers=headers)
    assert delete_response.status_code == 200, delete_response.text
    assert delete_response.json()["data"]["deleted"] is True

    audit_rows = db_session.query(AdminAuditLog).all()
    assert any(row.action == "admin.users.delete" for row in audit_rows)
