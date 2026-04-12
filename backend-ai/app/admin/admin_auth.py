from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings
from app.middleware.auth_middleware import get_current_admin

ADMIN_JWT_AUDIENCE = "sentinelcore-admin"
ADMIN_JWT_ISSUER = "sentinelcore-admin"
ADMIN_TOKEN_TYPE = "admin_access"


def create_admin_access_token(admin: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "admin_id": str(admin.get("_id") or admin.get("id") or ""),
        "sub": str(admin.get("email", "")).lower(),
        "email": str(admin.get("email", "")).lower(),
        "role": "admin",
        "type": ADMIN_TOKEN_TYPE,
        "aud": ADMIN_JWT_AUDIENCE,
        "iss": ADMIN_JWT_ISSUER,
        "iat": now,
        "nbf": now,
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_admin_token(token: str) -> dict[str, str]:
    credentials_exception = ValueError("Invalid admin credentials")
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=ADMIN_JWT_AUDIENCE,
            issuer=ADMIN_JWT_ISSUER,
        )
    except JWTError as exc:
        raise credentials_exception from exc

    token_type = str(payload.get("type") or "")
    admin_id = str(payload.get("admin_id") or "")
    if token_type != ADMIN_TOKEN_TYPE or not admin_id:
        raise credentials_exception
    return {
        "admin_id": admin_id,
        "role": str(payload.get("role") or "").strip().lower(),
    }


__all__ = ["create_admin_access_token", "decode_admin_token", "get_current_admin"]
