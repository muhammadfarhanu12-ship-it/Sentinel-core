from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from app.security.roles import normalize_user_role


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def user_model(user: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name"),
        "tier": user.get("tier", "FREE"),
        "role": normalize_user_role(user.get("role")),
        "organization_name": user.get("organization_name"),
        "is_active": bool(user.get("is_active", True)),
        "is_verified": bool(user.get("is_verified", False)),
        "email_verified_at": _as_datetime(user["email_verified_at"]) if user.get("email_verified_at") else None,
        "last_login_at": _as_datetime(user["last_login_at"]) if user.get("last_login_at") else None,
        "created_at": _as_datetime(user.get("created_at")),
        "updated_at": _as_datetime(user.get("updated_at")),
    }
