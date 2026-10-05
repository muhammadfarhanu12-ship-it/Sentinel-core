from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

from app.admin import admin_service


def request():
    return Request({
        "type": "http", "method": "POST", "path": "/api/v1/admin/forgot-password",
        "headers": [(b"x-forwarded-for", b"198.51.100.99")],
        "client": ("203.0.113.10", 1234),
    })


@pytest.mark.parametrize("user,is_admin", [
    (None, False), ({"email": "owner@example.com"}, False),
    ({"email": "owner@example.com", "isPlatformAdmin": True}, True),
])
def test_admin_recovery_only_emails_eligible_admin_and_never_returns_capability(monkeypatch, user, is_admin):
    collection = SimpleNamespace(find_one=AsyncMock(return_value=user), update_one=AsyncMock())
    sender = AsyncMock(return_value=SimpleNamespace(email_sent=True, reset_token="must-not-return"))
    monkeypatch.setattr(admin_service, "check_rate_limit", lambda *args, **kwargs: None)
    monkeypatch.setattr(admin_service, "has_platform_admin_access", lambda value: is_admin)
    monkeypatch.setattr(admin_service, "issue_password_reset_token", sender)
    service = admin_service.AdminService({"users": collection})

    result = asyncio.run(service.request_password_reset(" Owner@Example.com ", request()))

    assert result.model_dump() == {
        "message": "If an eligible admin account exists, password reset instructions have been emailed.",
        "email_sent": False, "reset_token": None, "expires_at": None,
    }
    if is_admin:
        sender.assert_awaited_once_with("owner@example.com")
    else:
        sender.assert_not_awaited()
    # Shared email service owns token creation/storage; this public handler must
    # never create a separately exposed admin password-reset capability.
    collection.update_one.assert_not_awaited()


def test_admin_limits_ignore_untrusted_forwarded_header():
    assert admin_service.AdminService._get_client_ip(request()) == "203.0.113.10"
