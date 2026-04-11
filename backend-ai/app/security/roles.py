from __future__ import annotations

from typing import Any

ADMIN_ROLE = "admin"
USER_ROLE = "user"

_ADMIN_ROLE_ALIASES = {
    ADMIN_ROLE,
    "super_admin",
}

_USER_ROLE_ALIASES = {
    USER_ROLE,
    "analyst",
    "viewer",
}


def normalize_user_role(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in _ADMIN_ROLE_ALIASES:
        return ADMIN_ROLE
    if normalized in _USER_ROLE_ALIASES:
        return USER_ROLE
    return USER_ROLE


def is_admin_role(value: Any) -> bool:
    return normalize_user_role(value) == ADMIN_ROLE
