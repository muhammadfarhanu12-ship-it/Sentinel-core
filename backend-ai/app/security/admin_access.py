from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

ADMIN_PERMISSION_ACCESS = "admin:access"
ADMIN_PERMISSION_USERS_VIEW = "admin:users:view"
ADMIN_PERMISSION_USERS_MANAGE = "admin:users:manage"
ADMIN_PERMISSION_COMPANIES_VIEW = "admin:companies:view"
ADMIN_PERMISSION_PLANS_MANAGE = "admin:plans:manage"
ADMIN_PERMISSION_FACTORS_MANAGE = "admin:factors:manage"
ADMIN_PERMISSION_AUDIT_VIEW = "admin:audit:view"
ADMIN_PERMISSION_SETTINGS_MANAGE = "admin:settings:manage"

SUPER_ADMIN_ROLE = "SUPER_ADMIN"
ADMIN_ROLE = "ADMIN"
SUPPORT_ROLE = "SUPPORT"

ADMIN_STATUS_ACTIVE = "active"
ADMIN_STATUS_DISABLED = "disabled"

SUPER_ADMIN_PERMISSIONS = {
    ADMIN_PERMISSION_ACCESS,
    ADMIN_PERMISSION_USERS_VIEW,
    ADMIN_PERMISSION_USERS_MANAGE,
    ADMIN_PERMISSION_COMPANIES_VIEW,
    ADMIN_PERMISSION_PLANS_MANAGE,
    ADMIN_PERMISSION_FACTORS_MANAGE,
    ADMIN_PERMISSION_AUDIT_VIEW,
    ADMIN_PERMISSION_SETTINGS_MANAGE,
}

ROLE_PERMISSION_MAP = {
    SUPER_ADMIN_ROLE: SUPER_ADMIN_PERMISSIONS,
    ADMIN_ROLE: {
        ADMIN_PERMISSION_ACCESS,
        ADMIN_PERMISSION_USERS_VIEW,
        ADMIN_PERMISSION_USERS_MANAGE,
        ADMIN_PERMISSION_COMPANIES_VIEW,
        ADMIN_PERMISSION_AUDIT_VIEW,
    },
    SUPPORT_ROLE: {
        ADMIN_PERMISSION_ACCESS,
        ADMIN_PERMISSION_USERS_VIEW,
        ADMIN_PERMISSION_COMPANIES_VIEW,
        ADMIN_PERMISSION_AUDIT_VIEW,
    },
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_admin_role(value: Any) -> str | None:
    normalized = str(value or "").strip().replace("-", "_").replace(" ", "_").upper()
    if normalized in ROLE_PERMISSION_MAP:
        return normalized
    if normalized == "OWNER":
        return SUPER_ADMIN_ROLE
    if normalized == "SUPERADMIN":
        return SUPER_ADMIN_ROLE
    return None


def normalize_admin_status(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == ADMIN_STATUS_DISABLED:
        return ADMIN_STATUS_DISABLED
    return ADMIN_STATUS_ACTIVE


def admin_permissions_for_role(role: str | None) -> list[str]:
    normalized_role = normalize_admin_role(role)
    if normalized_role is None:
        return []
    return sorted(ROLE_PERMISSION_MAP.get(normalized_role, set()))


def _permissions_from_document(user: dict[str, Any]) -> list[str]:
    raw_permissions = user.get("adminPermissions")
    if raw_permissions is None:
        raw_permissions = user.get("admin_permissions")
    if isinstance(raw_permissions, (list, tuple, set)):
        normalized = []
        for permission in raw_permissions:
            text = str(permission or "").strip()
            if text and text not in normalized:
                normalized.append(text)
        if normalized:
            return sorted(normalized)
    return []


def get_effective_admin_role(user: dict[str, Any] | None) -> str | None:
    if not isinstance(user, dict):
        return None

    explicit_role = normalize_admin_role(user.get("adminRole") or user.get("admin_role"))
    if explicit_role:
        return explicit_role

    if bool(user.get("isPlatformAdmin") or user.get("is_platform_admin")):
        return SUPER_ADMIN_ROLE

    legacy_role = str(user.get("role") or "").strip().lower()
    if legacy_role == "admin":
        return SUPER_ADMIN_ROLE
    if legacy_role == "super_admin":
        return SUPER_ADMIN_ROLE
    return None


def get_effective_admin_permissions(user: dict[str, Any] | None) -> list[str]:
    if not isinstance(user, dict):
        return []
    explicit_permissions = _permissions_from_document(user)
    if explicit_permissions:
        return explicit_permissions
    return admin_permissions_for_role(get_effective_admin_role(user))


def get_effective_admin_status(user: dict[str, Any] | None) -> str:
    if not isinstance(user, dict):
        return ADMIN_STATUS_DISABLED
    return normalize_admin_status(user.get("adminStatus") or user.get("admin_status"))


def has_platform_admin_access(user: dict[str, Any] | None) -> bool:
    if not isinstance(user, dict):
        return False
    role = get_effective_admin_role(user)
    if role is None:
        return False
    if not bool(user.get("is_active", True)):
        return False
    return get_effective_admin_status(user) == ADMIN_STATUS_ACTIVE


def has_admin_permission(user: dict[str, Any] | None, permission: str) -> bool:
    if not has_platform_admin_access(user):
        return False
    role = get_effective_admin_role(user)
    permissions = set(get_effective_admin_permissions(user))
    if role == SUPER_ADMIN_ROLE:
      return True
    return permission in permissions


def build_admin_session_payload(user: dict[str, Any]) -> dict[str, Any]:
    role = get_effective_admin_role(user)
    permissions = get_effective_admin_permissions(user)
    return {
        "email": str(user.get("email") or "").lower(),
        "role": "admin",
        "isPlatformAdmin": has_platform_admin_access(user),
        "adminRole": role,
        "adminPermissions": permissions,
        "adminStatus": get_effective_admin_status(user),
        "adminCreatedAt": user.get("adminCreatedAt") or user.get("admin_created_at"),
        "adminLastLoginAt": user.get("adminLastLoginAt") or user.get("admin_last_login_at"),
        "forcePasswordChange": bool(user.get("forcePasswordChange") or user.get("force_password_change", False)),
    }


def build_admin_update(
    *,
    current_user: dict[str, Any] | None,
    password_hash: str | None,
    create_if_missing: bool,
    generated_password: bool,
) -> dict[str, Any]:
    existing = current_user or {}
    now = _utcnow()
    update: dict[str, Any] = {
        "isPlatformAdmin": True,
        "is_platform_admin": True,
        "adminRole": SUPER_ADMIN_ROLE,
        "admin_role": SUPER_ADMIN_ROLE,
        "adminPermissions": admin_permissions_for_role(SUPER_ADMIN_ROLE),
        "admin_permissions": admin_permissions_for_role(SUPER_ADMIN_ROLE),
        "adminStatus": ADMIN_STATUS_ACTIVE,
        "admin_status": ADMIN_STATUS_ACTIVE,
        "adminCreatedAt": existing.get("adminCreatedAt") or existing.get("admin_created_at") or now,
        "admin_created_at": existing.get("admin_created_at") or existing.get("adminCreatedAt") or now,
        "updated_at": now,
        "is_active": True,
        "is_verified": True,
        "email_verified_at": existing.get("email_verified_at") or now,
        "forcePasswordChange": bool(existing.get("forcePasswordChange") or generated_password),
        "force_password_change": bool(existing.get("force_password_change") or generated_password),
    }
    if password_hash:
        update["hashed_password"] = password_hash
        update["password_updated_at"] = now
    if create_if_missing:
        update.setdefault("created_at", now)
    return update
