from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.admin.admin_router import get_admin_service, router as admin_router
from app.admin.admin_service import AdminService
from app.middleware.auth_middleware import get_current_admin
from app.security.admin_access import (
    ADMIN_PERMISSION_ACCESS,
    ADMIN_STATUS_DISABLED,
    SUPER_ADMIN_ROLE,
    has_admin_permission,
    has_platform_admin_access,
)
from app.utils.hashing import get_password_hash
from scripts.make_admin_owner import promote_admin_owner


class AsyncCollection:
    def __init__(self, documents: list[dict] | None = None):
        self.documents = list(documents or [])

    async def find_one(self, query: dict):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    async def update_one(self, query: dict, update: dict):
        document = await self.find_one(query)
        if document is not None:
            document.update(update.get("$set", {}))

    async def delete_one(self, query: dict):
        document = await self.find_one(query)
        if document is not None:
            self.documents.remove(document)

    async def insert_one(self, document: dict):
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document.get("_id"))


class AsyncDb:
    def __init__(self, users: list[dict]):
        self.collections = {
            "users": AsyncCollection(users),
            "admin_login_attempts": AsyncCollection(),
            "audit_logs": AsyncCollection(),
        }

    def __getitem__(self, name: str):
        return self.collections[name]


class SyncCollection:
    def __init__(self, documents: list[dict] | None = None):
        self.documents = list(documents or [])

    def find_one(self, query: dict):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    def insert_one(self, document: dict):
        if "_id" not in document:
            document["_id"] = f"user-{len(self.documents) + 1}"
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    def update_one(self, query: dict, update: dict):
        document = self.find_one(query)
        if document is not None:
            document.update(update.get("$set", {}))


class SyncDb:
    def __init__(self, users: list[dict]):
        self.collections = {
            "users": SyncCollection(users),
            "audit_logs": SyncCollection(),
        }

    def __getitem__(self, name: str):
        return self.collections[name]


def make_request(ip: str = "127.0.0.1"):
    return SimpleNamespace(headers={}, client=SimpleNamespace(host=ip), state=SimpleNamespace(request_id="test-request"))


def test_admin_login_rejects_normal_user(monkeypatch: pytest.MonkeyPatch):
    user = {
        "_id": "user-1",
        "email": "member@example.com",
        "hashed_password": get_password_hash("StrongPass123"),
        "role": "user",
        "is_active": True,
        "is_verified": True,
    }
    service = AdminService(AsyncDb([user]))
    async def noop_capture(**_kwargs):
        return None
    async def noop_audit(*_args, **_kwargs):
        return None
    monkeypatch.setattr(service, "_capture_failed_login_attempt", noop_capture)
    monkeypatch.setattr(service, "_record_admin_audit", noop_audit)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.login("member@example.com", "StrongPass123", make_request("127.0.0.11")))

    assert "admin panel access" in str(exc.value.detail).lower()


def test_admin_login_allows_super_admin(monkeypatch: pytest.MonkeyPatch):
    user = {
        "_id": "user-2",
        "email": "owner@example.com",
        "hashed_password": get_password_hash("StrongPass123"),
        "role": "user",
        "is_active": True,
        "is_verified": True,
        "isPlatformAdmin": True,
        "adminRole": "SUPER_ADMIN",
        "adminPermissions": ["admin:access", "admin:users:manage"],
        "adminStatus": "active",
    }
    service = AdminService(AsyncDb([user]))
    async def noop_reset(**_kwargs):
        return None
    async def noop_audit(*_args, **_kwargs):
        return None
    async def noop_notify(**_kwargs):
        return None
    monkeypatch.setattr(service, "_reset_failed_login_attempts", noop_reset)
    monkeypatch.setattr(service, "_record_admin_audit", noop_audit)
    monkeypatch.setattr(service, "_send_success_login_notification", noop_notify)

    result = asyncio.run(service.login("owner@example.com", "StrongPass123", make_request("127.0.0.12")))

    assert result.admin_role == "SUPER_ADMIN"
    assert "admin:access" in result.admin_permissions


def test_admin_login_rejects_disabled_admin(monkeypatch: pytest.MonkeyPatch):
    user = {
        "_id": "user-3",
        "email": "disabled@example.com",
        "hashed_password": get_password_hash("StrongPass123"),
        "role": "user",
        "is_active": True,
        "is_verified": True,
        "isPlatformAdmin": True,
        "adminRole": "SUPER_ADMIN",
        "adminStatus": ADMIN_STATUS_DISABLED,
    }
    service = AdminService(AsyncDb([user]))
    async def noop_capture(**_kwargs):
        return None
    async def noop_audit(*_args, **_kwargs):
        return None
    monkeypatch.setattr(service, "_capture_failed_login_attempt", noop_capture)
    monkeypatch.setattr(service, "_record_admin_audit", noop_audit)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.login("disabled@example.com", "StrongPass123", make_request("127.0.0.13")))

    assert "disabled" in str(exc.value.detail).lower()


def test_admin_auth_me_and_permission_gate():
    app = FastAPI()
    app.include_router(admin_router)

    class FakeService:
        async def get_admin_session(self, admin):
            from app.security.admin_access import build_admin_session_payload
            from app.admin.admin_schema import AdminSessionResponse, AdminSessionUserResponse

            payload = build_admin_session_payload(admin)
            return AdminSessionResponse(user=AdminSessionUserResponse(**payload))

    async def current_super_admin():
        return {
            "email": "owner@example.com",
            "isPlatformAdmin": True,
            "adminRole": "SUPER_ADMIN",
            "adminPermissions": ["admin:access", "admin:audit:view"],
            "adminStatus": "active",
            "is_active": True,
        }

    async def current_normal_user():
        return {
            "email": "member@example.com",
            "role": "user",
            "is_active": True,
        }

    app.dependency_overrides[get_admin_service] = lambda: FakeService()
    app.dependency_overrides[get_current_admin] = current_super_admin
    with TestClient(app) as client:
        response = client.get("/admin/auth/me")
        assert response.status_code == 200, response.text
        assert response.json()["data"]["user"]["adminRole"] == "SUPER_ADMIN"

    app.dependency_overrides[get_current_admin] = current_normal_user
    with TestClient(app) as client:
        response = client.get("/admin/auth/me")
        assert response.status_code == 403, response.text


def test_make_admin_owner_promotes_only_selected_email():
    users = [
        {"_id": "user-1", "email": "one@example.com", "role": "user", "is_active": True, "is_verified": True},
        {"_id": "user-2", "email": "two@example.com", "role": "user", "is_active": True, "is_verified": True},
    ]
    db = SyncDb(users)

    result = promote_admin_owner(db, email="one@example.com", create=False, password=None)

    assert result["email"] == "one@example.com"
    assert db["users"].find_one({"email": "one@example.com"})["adminRole"] == SUPER_ADMIN_ROLE
    assert db["users"].find_one({"email": "two@example.com"}).get("adminRole") is None
    assert len(db["audit_logs"].documents) == 1


def test_admin_permission_helper_allows_only_platform_admins():
    normal_user = {"email": "member@example.com", "role": "user", "is_active": True}
    super_admin = {
        "email": "owner@example.com",
        "isPlatformAdmin": True,
        "adminRole": "SUPER_ADMIN",
        "adminStatus": "active",
        "is_active": True,
    }

    assert has_platform_admin_access(normal_user) is False
    assert has_platform_admin_access(super_admin) is True
    assert has_admin_permission(super_admin, ADMIN_PERMISSION_ACCESS) is True
