from __future__ import annotations

import asyncio
import copy
import os
from datetime import timedelta
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from pymongo.errors import DuplicateKeyError

os.environ.setdefault("ENABLE_DEMO_MODE", "true")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_1234567890")
os.environ.setdefault("API_KEY_SECRET", "test_api_key_secret_1234567890")
os.environ.setdefault("DEMO_USER_EMAIL", "demo@example.com")
os.environ.setdefault("ADMIN_BOOTSTRAP_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_BOOTSTRAP_PASSWORD", "TestAdminPass123")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/sentinel-auth-tests")
os.environ.setdefault("MONGO_DB_NAME", "sentinel_auth_tests")
os.environ.setdefault("SMTP_HOST", "smtp.test")
os.environ.setdefault("SMTP_PORT", "587")
os.environ.setdefault("SMTP_USER", "tester@example.com")
os.environ.setdefault("SMTP_PASS", "password-placeholder")
os.environ.setdefault("FROM_EMAIL", "Sentinel Test <tester@example.com>")
os.environ.setdefault("SMTP_VERIFY_ON_STARTUP", "false")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

import app.database as database_module
import app.main as main_module
from app.admin.admin_auth import create_admin_access_token
from app.core.config import settings
from app.main import app
from app.middleware.rate_limiter import limiter
from app.routes.admin import get_admin_service
from app.services import admin_login_notification_service
from app.services import auth_service
from app.services import admin_user_service
from app.services.email_service import EmailSendResult
from app.services import session_service
from app.utils.hash import verify_password
from app.utils.token_generator import create_access_token


class InMemoryCursor:
    def __init__(self, documents: list[dict]) -> None:
        self._documents = documents
        self._skip = 0
        self._limit: int | None = None

    def sort(self, field: str, direction: int):
        reverse = int(direction) < 0
        self._documents.sort(key=lambda item: (item.get(field) is None, item.get(field)), reverse=reverse)
        return self

    def skip(self, value: int):
        self._skip = max(0, int(value))
        return self

    def limit(self, value: int):
        self._limit = max(0, int(value))
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        documents = self._documents[self._skip:]
        if self._limit is not None:
            documents = documents[: self._limit]
        if length is not None:
            documents = documents[:length]
        return [copy.deepcopy(document) for document in documents]


class InMemoryCollection:
    def __init__(self, *, unique_fields: tuple[str, ...] = ()) -> None:
        self._documents: dict[str, dict] = {}
        self._unique_fields = unique_fields

    async def create_indexes(self, _indexes) -> list[str]:
        return []

    async def find_one(self, query: dict) -> dict | None:
        for document in self._documents.values():
            if self._matches(document, query):
                return copy.deepcopy(document)
        return None

    def find(self, query: dict | None = None, projection: dict | None = None) -> InMemoryCursor:
        documents = []
        for document in self._documents.values():
            if not self._matches(document, query or {}):
                continue

            candidate = copy.deepcopy(document)
            if projection:
                for field, include in projection.items():
                    if int(include) == 0:
                        candidate.pop(field, None)
            documents.append(candidate)
        return InMemoryCursor(documents)

    async def insert_one(self, document: dict) -> SimpleNamespace:
        for field in self._unique_fields:
            value = document.get(field)
            if value is None:
                continue
            if any(existing.get(field) == value for existing in self._documents.values()):
                raise DuplicateKeyError(f"duplicate {field}")

        stored = copy.deepcopy(document)
        stored["_id"] = stored.get("_id") or ObjectId()
        self._documents[str(stored["_id"])] = stored
        return SimpleNamespace(inserted_id=stored["_id"])

    async def update_one(self, query: dict, update: dict) -> SimpleNamespace:
        for key, document in self._documents.items():
            if not self._matches(document, query):
                continue

            for field, value in update.get("$set", {}).items():
                document[field] = value
            for field in update.get("$unset", {}):
                document.pop(field, None)
            self._documents[key] = document
            return SimpleNamespace(matched_count=1, modified_count=1)

        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query: dict, update: dict) -> SimpleNamespace:
        modified_count = 0
        for key, document in self._documents.items():
            if not self._matches(document, query):
                continue

            for field, value in update.get("$set", {}).items():
                document[field] = value
            for field in update.get("$unset", {}):
                document.pop(field, None)
            self._documents[key] = document
            modified_count += 1

        return SimpleNamespace(matched_count=modified_count, modified_count=modified_count)

    async def count_documents(self, query: dict) -> int:
        return sum(1 for document in self._documents.values() if self._matches(document, query))

    async def delete_one(self, query: dict) -> SimpleNamespace:
        for key, document in list(self._documents.items()):
            if not self._matches(document, query):
                continue
            del self._documents[key]
            return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query: dict) -> SimpleNamespace:
        deleted_count = 0
        for key, document in list(self._documents.items()):
            if not self._matches(document, query):
                continue
            del self._documents[key]
            deleted_count += 1
        return SimpleNamespace(deleted_count=deleted_count)

    def _matches(self, document: dict, query: dict) -> bool:
        return all(document.get(field) == value for field, value in query.items())


class InMemoryDatabase:
    def __init__(self, collections: dict[str, InMemoryCollection] | None = None) -> None:
        self._collections = collections or {}

    def get_collection(self, name: str) -> InMemoryCollection:
        collection = self._collections.get(name)
        if collection is None:
            collection = InMemoryCollection()
            self._collections[name] = collection
        return collection

    def __getitem__(self, name: str) -> InMemoryCollection:
        return self.get_collection(name)


@pytest.fixture()
def auth_client(monkeypatch: pytest.MonkeyPatch):
    users_collection = InMemoryCollection(unique_fields=("email",))
    sessions_collection = InMemoryCollection(unique_fields=("jti_hash",))
    database = InMemoryDatabase({"users": users_collection, "auth_sessions": sessions_collection})

    async def fake_connect_to_mongo(*, app=None) -> None:
        await users_collection.create_indexes([])
        await sessions_collection.create_indexes([])
        if app is not None:
            app.state.database = database
            app.state.mongodb_client = object()

    async def fake_close_mongo_connection(*, app=None) -> None:
        if app is not None:
            app.state.database = None
            app.state.mongodb_client = None
        return None

    async def fake_ping_mongo() -> None:
        return None

    limiter._events.clear()
    monkeypatch.setattr(settings, "SMTP_VERIFY_ON_STARTUP", False, raising=False)
    monkeypatch.setattr(database_module, "users_collection", users_collection)
    monkeypatch.setattr(database_module, "user_collection", users_collection)
    monkeypatch.setattr(database_module, "auth_sessions_collection", sessions_collection)
    monkeypatch.setattr(database_module, "session_collection", sessions_collection)
    monkeypatch.setattr(auth_service, "users_collection", users_collection)
    monkeypatch.setattr(admin_user_service, "users_collection", users_collection)
    monkeypatch.setattr(session_service, "auth_sessions_collection", sessions_collection)
    monkeypatch.setattr(main_module, "connect_to_mongo", fake_connect_to_mongo)
    monkeypatch.setattr(main_module, "close_mongo_connection", fake_close_mongo_connection)
    monkeypatch.setattr(main_module, "ping_mongo", fake_ping_mongo)

    with TestClient(app) as client:
        yield client, users_collection, sessions_collection

    limiter._events.clear()


def _signup(client: TestClient, email: str, password: str = "StrongPass123", name: str = "Test User"):
    return client.post(
        "/api/auth/signup",
        json={"name": name, "email": email, "password": password},
    )


def _login(client: TestClient, email: str, password: str):
    return client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )


def _verify(client: TestClient, token: str):
    return client.get(f"/api/auth/verify-email?token={token}")


class FakeAdminService:
    async def get_dashboard(self, admin: dict) -> dict:
        return {
            "message": "Welcome Admin",
            "admin": {
                "id": str(admin.get("id")),
                "email": str(admin.get("email")),
                "role": str(admin.get("role")),
            },
        }

    async def get_metrics(self, admin: dict) -> dict:
        _ = admin
        return {
            "total_users": 1,
            "active_users": 1,
            "suspended_users": 0,
            "total_requests": 12,
            "threats_blocked": 3,
            "active_api_keys": 2,
            "quarantined_api_keys": 0,
            "avg_latency_ms": 17.5,
            "requests_last_7_days": [],
        }

    async def get_system_status(self, admin: dict) -> dict:
        _ = admin
        return {
            "status": "ok",
            "database": "ok",
            "uptime_hint": "healthy",
            "admin_count": 1,
            "last_security_event_at": None,
        }

    async def list_users(self, admin: dict, limit: int, offset: int, q: str | None, is_active: bool | None, tier: str | None) -> list[dict]:
        _ = (admin, limit, offset, q, is_active, tier)
        return [
            {
                "id": "admin-1",
                "email": "platform.admin@example.com",
                "tier": "FREE",
                "organization_name": "example.com",
                "is_active": True,
                "monthly_limit": 1000,
                "created_at": auth_service._utcnow(),
                "api_usage": 0,
                "api_key_count": 0,
            }
        ]

    async def delete_user(self, admin: dict, user_id: str) -> dict:
        _ = admin
        return {"deleted": True, "user_id": user_id}

    async def update_user_status(self, admin: dict, user_id: str, payload) -> dict:
        _ = admin
        return {
            "id": user_id,
            "email": "member@example.com",
            "tier": "FREE",
            "organization_name": "example.com",
            "is_active": bool(payload.is_active),
            "monthly_limit": 1000,
            "created_at": auth_service._utcnow(),
            "api_usage": 0,
            "api_key_count": 0,
        }

    async def list_logs(
        self,
        admin: dict,
        limit: int,
        offset: int,
        q: str | None,
        status: str | None,
        risk_level: str | None,
        threat_type: str | None,
        only_quarantined: bool | None,
    ) -> list[dict]:
        _ = (admin, limit, offset, q, status, risk_level, threat_type, only_quarantined)
        return [
            {
                "id": "log-1",
                "timestamp": auth_service._utcnow(),
                "api_key_id": "key-1",
                "user_id": "admin-1",
                "user_email": "platform.admin@example.com",
                "status": "BLOCKED",
                "threat_type": "PROMPT_INJECTION",
                "threat_types": ["PROMPT_INJECTION"],
                "threat_score": 0.98,
                "risk_score": 0.99,
                "attack_vector": "prompt",
                "risk_level": "high",
                "endpoint": "/api/v1/brain/analyze",
                "method": "POST",
                "model": "gemini-test",
                "latency_ms": 12,
                "tokens_used": 123,
                "ip_address": "127.0.0.1",
                "is_quarantined": False,
                "raw_payload": {"prompt": "ignore previous"},
            }
        ]

    async def list_threats(self, *args, **kwargs) -> list[dict]:
        return await self.list_logs(*args, **kwargs)

    async def list_api_keys(self, admin: dict, limit: int, offset: int, q: str | None, status: str | None) -> list[dict]:
        _ = (admin, limit, offset, q, status)
        return [
            {
                "id": "key-1",
                "user_id": "admin-1",
                "user_email": "platform.admin@example.com",
                "name": "Primary Key",
                "prefix": "sentinel_sk_",
                "status": "ACTIVE",
                "usage_count": 3,
                "last_used": None,
                "last_ip": None,
                "created_at": auth_service._utcnow(),
                "key": None,
            }
        ]

    async def create_gateway_api_key(self, admin: dict, payload) -> dict:
        _ = admin
        return {
            "id": "key-2",
            "user_id": str(payload.user_id),
            "user_email": "platform.admin@example.com",
            "name": str(payload.name),
            "prefix": "sentinel_sk_",
            "status": "ACTIVE",
            "usage_count": 0,
            "last_used": None,
            "last_ip": None,
            "created_at": auth_service._utcnow(),
            "key": "sentinel_sk_demo",
        }

    async def revoke_gateway_api_key(self, admin: dict, key_id: str) -> dict:
        _ = admin
        return {
            "id": key_id,
            "user_id": "admin-1",
            "user_email": "platform.admin@example.com",
            "name": "Primary Key",
            "prefix": "sentinel_sk_",
            "status": "REVOKED",
            "usage_count": 3,
            "last_used": None,
            "last_ip": None,
            "created_at": auth_service._utcnow(),
            "key": None,
        }

    async def get_settings(self, admin: dict) -> dict:
        _ = admin
        return {
            "enable_gemini_module": True,
            "enable_openai_module": True,
            "enable_anthropic_module": True,
            "ai_kill_switch_enabled": False,
            "require_mfa_for_admin": False,
            "admin_rate_limit_per_minute": 120,
            "admin_rate_limit_window_seconds": 60,
            "api_key_rate_limit_per_minute": 150,
            "updated_by_user_id": "admin-1",
            "updated_at": auth_service._utcnow(),
        }

    async def update_settings(self, admin: dict, payload) -> dict:
        _ = admin
        return {
            **payload.model_dump(),
            "updated_by_user_id": "admin-1",
            "updated_at": auth_service._utcnow(),
        }


def _override_admin_service() -> None:
    app.dependency_overrides[get_admin_service] = lambda: FakeAdminService()


def _clear_admin_service_override() -> None:
    app.dependency_overrides.pop(get_admin_service, None)


def test_signup_sends_verification_email(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, collection, _ = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["recipient_email"] = recipient_email
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-1")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    response = _signup(client, "new.user@example.com")

    assert response.status_code == 201, response.text
    assert response.json()["data"]["message"] == "Verification email sent successfully."
    assert captured["recipient_email"] == "new.user@example.com"

    stored_user = next(iter(collection._documents.values()))
    assert stored_user["email"] == "new.user@example.com"
    assert stored_user["role"] == "user"
    assert stored_user["is_verified"] is False
    assert stored_user["verification_token_hash"]
    assert stored_user["verify_token_hash"] == stored_user["verification_token_hash"]
    assert stored_user["verify_token_expires_at"] == stored_user["verification_token_expiry"]


def test_signup_rejects_role_assignment_from_client(auth_client):
    client, collection, _ = auth_client

    response = client.post(
        "/api/auth/signup",
        json={
            "name": "Privilege Escalation Attempt",
            "email": "not.allowed@example.com",
            "password": "StrongPass123",
            "role": "admin",
        },
    )

    assert response.status_code == 422
    assert collection._documents == {}


def test_cannot_login_without_email_verification(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        return EmailSendResult(success=True, message_id="verification-2")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "locked.user@example.com")
    assert signup_response.status_code == 201, signup_response.text

    login_response = _login(client, "locked.user@example.com", "StrongPass123")

    assert login_response.status_code == 403
    assert login_response.json()["error"]["message"] == "Email not verified"


def test_verify_email_allows_login(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, sessions = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-3")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "verified.user@example.com")
    assert signup_response.status_code == 201, signup_response.text

    verify_response = _verify(client, captured["token"])
    assert verify_response.status_code == 200, verify_response.text
    assert verify_response.json()["data"]["message"] == "Email verified successfully."

    login_response = _login(client, "verified.user@example.com", "StrongPass123")

    assert login_response.status_code == 200, login_response.text
    payload = login_response.json()["data"]
    assert payload["access_token"]
    assert payload["role"] == "user"
    assert payload["refresh_token"]
    assert payload["user"]["role"] == "user"
    assert payload["user"]["is_verified"] is True
    assert len(sessions._documents) == 1


def test_login_accepts_json_and_returns_role(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-json-login")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "json.login@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, captured["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "json.login@example.com", "password": "StrongPass123"},
    )

    assert login_response.status_code == 200, login_response.text
    payload = login_response.json()["data"]
    assert payload["access_token"]
    assert payload["token_type"] == "bearer"
    assert payload["role"] == "user"


def test_admin_bootstrap_promotes_existing_user_and_hashes_password(auth_client):
    _, collection, _ = auth_client
    user_id = ObjectId()
    now = auth_service._utcnow()
    collection._documents[str(user_id)] = {
        "_id": user_id,
        "email": "ops.admin@example.com",
        "name": "Ops User",
        "hashed_password": "stale-hash",
        "organization_name": "example.com",
        "tier": "FREE",
        "role": "user",
        "is_active": False,
        "is_verified": False,
        "verification_token_hash": "token-hash",
        "verify_token_hash": "token-hash",
        "verification_token": None,
        "verify_token": None,
        "verification_token_expiry": now + timedelta(minutes=30),
        "verify_token_expires_at": now + timedelta(minutes=30),
        "reset_token_hash": "reset-hash",
        "reset_token_expiry": now + timedelta(minutes=30),
        "email_verified_at": None,
        "password_updated_at": now,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
    }

    admin_user = asyncio.run(
        admin_user_service.ensure_admin_user(
            email="ops.admin@example.com",
            password="AdminPass123",
            name="Operations Admin",
        )
    )

    stored_user = collection._documents[str(user_id)]
    assert admin_user.role == "admin"
    assert stored_user["role"] == "admin"
    assert stored_user["is_verified"] is True
    assert stored_user["is_active"] is True
    assert stored_user["verification_token_hash"] is None
    assert stored_user["reset_token_hash"] is None
    assert verify_password("AdminPass123", stored_user["hashed_password"])


def test_normal_user_cannot_access_admin_routes(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-admin-forbidden")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "normal.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, captured["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = _login(client, "normal.user@example.com", "StrongPass123")
    assert login_response.status_code == 200, login_response.text
    access_token = login_response.json()["data"]["access_token"]

    missing_token_response = client.get("/api/admin/dashboard")
    user_token_response = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {access_token}"})

    assert missing_token_response.status_code == 401
    assert user_token_response.status_code == 403
    assert user_token_response.json()["error"]["message"] == "Admin access required"


def test_admin_user_can_access_admin_routes(auth_client):
    client, _, _ = auth_client

    asyncio.run(
        admin_user_service.ensure_admin_user(
            email="platform.admin@example.com",
            password="AdminPass123",
            name="Platform Admin",
        )
    )

    login_response = _login(client, "platform.admin@example.com", "AdminPass123")
    assert login_response.status_code == 200, login_response.text
    payload = login_response.json()["data"]
    assert payload["role"] == "admin"
    assert payload["user"]["role"] == "admin"

    headers = {"Authorization": f"Bearer {payload['access_token']}"}
    dashboard_response = client.get("/api/admin/dashboard", headers=headers)
    users_response = client.get("/api/admin/users", headers=headers)

    assert dashboard_response.status_code == 200, dashboard_response.text
    assert dashboard_response.json()["data"]["message"] == "Welcome Admin"
    assert dashboard_response.json()["data"]["user"]["email"] == "platform.admin@example.com"
    assert users_response.status_code == 200, users_response.text
    assert any(user["email"] == "platform.admin@example.com" for user in users_response.json()["data"])


def test_admin_login_sends_activity_email(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    captured: dict[str, object] = {}

    asyncio.run(
        admin_user_service.ensure_admin_user(
            email="alerts.admin@example.com",
            password="AdminPass123",
            name="Alerts Admin",
        )
    )

    async def fake_send_admin_login_success_email_async(*, admin_email: str, login_at, ip_address: str | None, user_agent: str | None):
        captured["admin_email"] = admin_email
        captured["login_at"] = login_at
        captured["ip_address"] = ip_address
        captured["user_agent"] = user_agent
        return EmailSendResult(success=True, message_id="admin-login-success-1")

    async def fake_send_admin_login_failed_attempt_alert_async(**_kwargs):
        raise AssertionError("Failed-attempt alert should not be sent for a successful admin login")

    monkeypatch.setattr(
        admin_login_notification_service,
        "send_admin_login_success_email_async",
        fake_send_admin_login_success_email_async,
    )
    monkeypatch.setattr(
        admin_login_notification_service,
        "send_admin_login_failed_attempt_alert_async",
        fake_send_admin_login_failed_attempt_alert_async,
    )

    response = client.post(
        "/api/admin/auth/login",
        json={"email": "alerts.admin@example.com", "password": "AdminPass123"},
        headers={
            "x-forwarded-for": "203.0.113.25",
            "user-agent": "SentinelAdminTests/1.0",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["access_token"]
    assert captured["admin_email"] == "alerts.admin@example.com"
    assert captured["ip_address"] == "203.0.113.25"
    assert captured["user_agent"] == "SentinelAdminTests/1.0"
    assert captured["login_at"] is not None


def test_admin_failed_login_alert_triggers_at_threshold_and_resets_after_success(
    auth_client,
    monkeypatch: pytest.MonkeyPatch,
):
    client, _, _ = auth_client
    alert_counts: list[int] = []

    asyncio.run(
        admin_user_service.ensure_admin_user(
            email="threshold.admin@example.com",
            password="AdminPass123",
            name="Threshold Admin",
        )
    )

    async def fake_send_admin_login_success_email_async(**_kwargs):
        return EmailSendResult(success=True, message_id="admin-login-success-2")

    async def fake_send_admin_login_failed_attempt_alert_async(*, attempt_count: int, **kwargs):
        alert_counts.append(attempt_count)
        assert kwargs["attempted_email"] == "threshold.admin@example.com"
        assert kwargs["ip_address"] in {"198.51.100.8", "198.51.100.10"}
        return EmailSendResult(success=True, message_id=f"admin-login-alert-{attempt_count}")

    monkeypatch.setattr(
        admin_login_notification_service,
        "send_admin_login_success_email_async",
        fake_send_admin_login_success_email_async,
    )
    monkeypatch.setattr(
        admin_login_notification_service,
        "send_admin_login_failed_attempt_alert_async",
        fake_send_admin_login_failed_attempt_alert_async,
    )

    for _ in range(4):
        response = client.post(
            "/api/admin/auth/login",
            json={"email": "threshold.admin@example.com", "password": "WrongPass123"},
            headers={"x-forwarded-for": "198.51.100.8", "user-agent": "SentinelAdminTests/threshold"},
        )
        assert response.status_code == 401, response.text

    assert alert_counts == []

    fifth_attempt = client.post(
        "/api/admin/auth/login",
        json={"email": "threshold.admin@example.com", "password": "WrongPass123"},
        headers={"x-forwarded-for": "198.51.100.8", "user-agent": "SentinelAdminTests/threshold"},
    )
    assert fifth_attempt.status_code == 401, fifth_attempt.text
    assert alert_counts == [5]

    success_response = client.post(
        "/api/admin/auth/login",
        json={"email": "threshold.admin@example.com", "password": "AdminPass123"},
        headers={"x-forwarded-for": "198.51.100.9", "user-agent": "SentinelAdminTests/threshold"},
    )
    assert success_response.status_code == 200, success_response.text

    for _ in range(5):
        response = client.post(
            "/api/admin/auth/login",
            json={"email": "threshold.admin@example.com", "password": "WrongPass123"},
            headers={"x-forwarded-for": "198.51.100.10", "user-agent": "SentinelAdminTests/threshold"},
        )
        assert response.status_code == 401, response.text

    assert alert_counts == [5, 5]


def test_rbac_admin_routes_accept_main_auth_admin_jwt(auth_client):
    client, _, _ = auth_client
    _override_admin_service()
    try:
        asyncio.run(
            admin_user_service.ensure_admin_user(
                email="rbac.admin@example.com",
                password="AdminPass123",
                name="RBAC Admin",
            )
        )

        login_response = _login(client, "rbac.admin@example.com", "AdminPass123")
        assert login_response.status_code == 200, login_response.text
        access_token = login_response.json()["data"]["access_token"]

        stats_response = client.get("/api/v1/admin/stats", headers={"Authorization": f"Bearer {access_token}"})
        users_response = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {access_token}"})
        logs_response = client.get("/api/v1/admin/logs", headers={"Authorization": f"Bearer {access_token}"})

        assert stats_response.status_code == 200, stats_response.text
        assert users_response.status_code == 200, users_response.text
        assert logs_response.status_code == 200, logs_response.text
        assert stats_response.json()["data"]["total_users"] == 1
        assert users_response.json()["data"][0]["email"] == "platform.admin@example.com"
        assert logs_response.json()["data"][0]["status"] == "BLOCKED"
    finally:
        _clear_admin_service_override()


def test_rbac_admin_routes_reject_normal_user_with_403(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    _override_admin_service()
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-rbac-admin-forbidden")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    try:
        signup_response = _signup(client, "rbac.normal@example.com")
        assert signup_response.status_code == 201, signup_response.text
        verify_response = _verify(client, captured["token"])
        assert verify_response.status_code == 200, verify_response.text

        login_response = _login(client, "rbac.normal@example.com", "StrongPass123")
        assert login_response.status_code == 200, login_response.text
        access_token = login_response.json()["data"]["access_token"]

        response = client.get("/api/v1/admin/stats", headers={"Authorization": f"Bearer {access_token}"})

        assert response.status_code == 403
        assert response.json()["error"]["message"] == "Admin access required"
    finally:
        _clear_admin_service_override()


def test_rbac_admin_routes_accept_existing_admin_access_token(auth_client):
    client, _, _ = auth_client
    _override_admin_service()
    try:
        admin_user = asyncio.run(
            admin_user_service.ensure_admin_user(
                email="dual.auth.admin@example.com",
                password="AdminPass123",
                name="Dual Auth Admin",
            )
        )
        admin_token = create_admin_access_token({"id": admin_user.id, "email": admin_user.email, "role": admin_user.role})

        response = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {admin_token}"})

        assert response.status_code == 200, response.text
        assert response.json()["data"][0]["email"] == "platform.admin@example.com"
    finally:
        _clear_admin_service_override()


def test_token_role_tampering_does_not_bypass_admin_check(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, collection, _ = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-admin-tamper")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "tamper.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, captured["token"])
    assert verify_response.status_code == 200, verify_response.text

    stored_user = next(document for document in collection._documents.values() if document["email"] == "tamper.user@example.com")
    tampered_access_token = create_access_token(
        data={
            "sub": "tamper.user@example.com",
            "user_id": str(stored_user["_id"]),
            "role": "admin",
        }
    )

    response = client.get(
        "/api/admin/dashboard",
        headers={"Authorization": f"Bearer {tampered_access_token}"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "Admin access required"


def test_verify_email_is_idempotent_for_the_same_token(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, collection, _ = auth_client
    captured: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        captured["token"] = token
        return EmailSendResult(success=True, message_id="verification-idempotent")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "repeat.verify@example.com")
    assert signup_response.status_code == 201, signup_response.text

    first_verify = _verify(client, captured["token"])
    second_verify = _verify(client, captured["token"])

    assert first_verify.status_code == 200, first_verify.text
    assert second_verify.status_code == 200, second_verify.text
    assert second_verify.json()["data"]["message"] == "Email verified successfully."

    stored_user = next(document for document in collection._documents.values() if document["email"] == "repeat.verify@example.com")
    assert stored_user["is_verified"] is True
    assert stored_user["last_verification_token_hash"] == auth_service._hash_token(captured["token"])


def test_verify_email_accepts_legacy_verify_token_fields(auth_client):
    client, collection, _ = auth_client
    user_id = ObjectId()
    now = auth_service._utcnow()
    legacy_token = "legacy-verify-token-abcdefghijklmnopqrstuvwxyz"

    collection._documents[str(user_id)] = {
        "_id": user_id,
        "email": "legacy.verify@example.com",
        "name": "Legacy User",
        "hashed_password": "hashed-password",
        "organization_name": "example.com",
        "tier": "FREE",
        "role": "ANALYST",
        "is_active": True,
        "is_verified": False,
        "verify_token": legacy_token,
        "verify_token_expires_at": now + timedelta(minutes=30),
        "verification_token_hash": None,
        "verify_token_hash": None,
        "verification_token_expiry": None,
        "email_verified_at": None,
        "password_updated_at": now,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
    }

    response = _verify(client, legacy_token)

    assert response.status_code == 200, response.text
    assert response.json()["data"]["message"] == "Email verified successfully."

    stored_user = collection._documents[str(user_id)]
    assert stored_user["is_verified"] is True
    assert stored_user["verify_token"] is None
    assert stored_user["verify_token_expires_at"] is None
    assert stored_user["verification_token_hash"] is None
    assert stored_user["verify_token_hash"] is None


def test_forgot_password_sends_reset_email_for_verified_user(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, collection, _ = auth_client
    verification_tokens: dict[str, str] = {}
    reset_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-4")

    async def fake_send_password_reset_email_async(*, recipient_email: str, token: str):
        reset_tokens["recipient_email"] = recipient_email
        reset_tokens["token"] = token
        return EmailSendResult(success=True, message_id="reset-1")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)
    monkeypatch.setattr(auth_service, "send_password_reset_email_async", fake_send_password_reset_email_async)

    signup_response = _signup(client, "forgot.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    forgot_response = client.post("/api/auth/forgot-password", json={"email": "forgot.user@example.com"})

    assert forgot_response.status_code == 200, forgot_response.text
    assert forgot_response.json()["data"]["message"] == "If an account exists, a password reset email has been sent."
    assert reset_tokens["recipient_email"] == "forgot.user@example.com"

    stored_user = next(document for document in collection._documents.values() if document["email"] == "forgot.user@example.com")
    assert stored_user["reset_token_hash"]
    assert stored_user["reset_token_expiry"]


def test_reset_password_updates_credentials_and_invalidates_old_token(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    verification_tokens: dict[str, str] = {}
    reset_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-5")

    async def fake_send_password_reset_email_async(*, recipient_email: str, token: str):
        reset_tokens["token"] = token
        return EmailSendResult(success=True, message_id="reset-2")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)
    monkeypatch.setattr(auth_service, "send_password_reset_email_async", fake_send_password_reset_email_async)

    signup_response = _signup(client, "reset.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    forgot_response = client.post("/api/auth/forgot-password", json={"email": "reset.user@example.com"})
    assert forgot_response.status_code == 200, forgot_response.text

    reset_response = client.post(
        "/api/auth/reset-password",
        json={"token": reset_tokens["token"], "new_password": "UpdatedPass123"},
    )
    assert reset_response.status_code == 200, reset_response.text
    assert reset_response.json()["data"]["message"] == "Password reset completed successfully."

    old_login_response = _login(client, "reset.user@example.com", "StrongPass123")
    assert old_login_response.status_code == 401
    assert old_login_response.json()["error"]["message"] == "Invalid password"

    new_login_response = _login(client, "reset.user@example.com", "UpdatedPass123")
    assert new_login_response.status_code == 200, new_login_response.text
    assert new_login_response.json()["data"]["access_token"]

    second_reset_response = client.post(
        "/api/auth/reset-password",
        json={"token": reset_tokens["token"], "new_password": "AnotherPass123"},
    )
    assert second_reset_response.status_code == 400
    assert second_reset_response.json()["error"]["message"] == "Invalid or expired reset token"


def test_refresh_rotates_session_and_logout_revokes_refresh_token(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, sessions = auth_client
    verification_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-6")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "refresh.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = _login(client, "refresh.user@example.com", "StrongPass123")
    assert login_response.status_code == 200, login_response.text
    refresh_token = login_response.json()["data"]["refresh_token"]

    refresh_response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200, refresh_response.text
    rotated_refresh_token = refresh_response.json()["data"]["refresh_token"]
    assert rotated_refresh_token != refresh_token

    replay_response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert replay_response.status_code == 401

    logout_response = client.post("/api/auth/logout", json={"refresh_token": rotated_refresh_token})
    assert logout_response.status_code == 200, logout_response.text
    assert logout_response.json()["data"]["message"] == "Logged out successfully."

    revoked_response = client.post("/api/auth/refresh", json={"refresh_token": rotated_refresh_token})
    assert revoked_response.status_code == 401
    assert len(sessions._documents) == 2


def test_health_reports_degraded_status_when_database_is_unavailable(monkeypatch: pytest.MonkeyPatch):
    async def fake_connect_to_mongo() -> None:
        raise RuntimeError("Mongo unavailable")

    async def fake_close_mongo_connection() -> None:
        return None

    async def fake_ping_mongo() -> None:
        raise RuntimeError("Mongo unavailable")

    limiter._events.clear()
    monkeypatch.setattr(settings, "SMTP_VERIFY_ON_STARTUP", False, raising=False)
    monkeypatch.setattr(main_module, "connect_to_mongo", fake_connect_to_mongo)
    monkeypatch.setattr(main_module, "close_mongo_connection", fake_close_mongo_connection)
    monkeypatch.setattr(main_module, "ping_mongo", fake_ping_mongo)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["database"] == "unavailable"


def test_logs_websocket_requires_valid_access_token(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    verification_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-7")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "ws.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = _login(client, "ws.user@example.com", "StrongPass123")
    access_token = login_response.json()["data"]["access_token"]

    with client.websocket_connect("/ws/logs") as websocket:
        with pytest.raises(WebSocketDisconnect) as exc:
            websocket.receive_text()
        assert exc.value.code == 1008

    with client.websocket_connect(f"/ws/logs?token={access_token}") as websocket:
        websocket.send_text("ping")
        websocket.close()


def test_logs_websocket_accepts_bearer_token_header(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    verification_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-7-header")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "ws.header.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = _login(client, "ws.header.user@example.com", "StrongPass123")
    access_token = login_response.json()["data"]["access_token"]

    with client.websocket_connect("/ws/logs", headers={"Authorization": f"Bearer {access_token}"}) as websocket:
        websocket.send_text("ping")
        websocket.close()


def test_notifications_websocket_requires_valid_access_token(auth_client, monkeypatch: pytest.MonkeyPatch):
    client, _, _ = auth_client
    verification_tokens: dict[str, str] = {}

    async def fake_send_verification_email_async(*, recipient_email: str, token: str):
        verification_tokens["token"] = token
        return EmailSendResult(success=True, message_id="verification-8")

    monkeypatch.setattr(auth_service, "send_verification_email_async", fake_send_verification_email_async)

    signup_response = _signup(client, "notify.user@example.com")
    assert signup_response.status_code == 201, signup_response.text
    verify_response = _verify(client, verification_tokens["token"])
    assert verify_response.status_code == 200, verify_response.text

    login_response = _login(client, "notify.user@example.com", "StrongPass123")
    access_token = login_response.json()["data"]["access_token"]

    with client.websocket_connect(f"/ws/notifications?token={access_token}") as websocket:
        websocket.send_text("ping")
        websocket.close()
