from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.db.mongo import get_database_from_request
from app.schemas.auth_schema import TokenData
from app.security.admin_access import (
    build_admin_session_payload,
    has_platform_admin_access,
)
from app.security.roles import is_admin_role, normalize_user_role
from app.services.auth_service import get_user_by_id
from app.utils.hash import get_password_hash

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Fields from the Mongo user document that must never travel inside the request context:
# anything that gets logged, serialized or returned by mistake would leak them.
_SENSITIVE_EXACT = {
    "hashed_password", "password_hash", "password", "hash", "salt",
    "totp_secret", "two_factor_secret", "mfa_secret", "otp_secret",
}


def _is_sensitive_field(name: str) -> bool:
    lowered = str(name).lower()
    # Deliberately narrow: counters such as "tokens_used" are legitimate user fields.
    return (
        lowered in _SENSITIVE_EXACT
        or lowered.endswith(("_token", "_secret", "_token_hash", "_password_hash"))
        or "token_hash" in lowered
    )


class CurrentUserContext(dict):
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_token(token: str, expected_type: str = "access") -> TokenData:
    credentials_exception = _credentials_error()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            # A token without exp would never expire. python-jose does not require it by default.
            options={"require_exp": True, "require_iss": True, "require_aud": True},
        )
    except JWTError as exc:
        raise credentials_exception from exc

    email = payload.get("sub")
    user_id = payload.get("user_id")
    token_type = payload.get("type")
    jti = payload.get("jti")
    if not email or not user_id or token_type != expected_type or not jti:
        raise credentials_exception

    reserved_claims = {"sub", "user_id", "type", "exp", "iat", "nbf", "iss", "aud", "jti"}
    extra_claims = {key: value for key, value in payload.items() if key not in reserved_claims}
    return TokenData(
        email=str(email),
        user_id=str(user_id),
        token_type=str(token_type),
        jti=str(jti),
        claims=extra_claims,
    )


def _build_current_user_context(mongo_user: dict[str, Any]) -> CurrentUserContext:
    identifier = str(mongo_user.get("_id") or mongo_user.get("id") or mongo_user.get("email"))
    created_at = mongo_user.get("created_at") or _utcnow()
    updated_at = mongo_user.get("updated_at") or created_at
    normalized_role = normalize_user_role(mongo_user.get("role"))

    safe_user = {k: v for k, v in mongo_user.items() if not _is_sensitive_field(k)}
    admin_payload = build_admin_session_payload(mongo_user)
    return CurrentUserContext(
        {
            **safe_user,
            "_id": identifier,
            "id": identifier,
            "email": str(mongo_user.get("email") or "").lower(),
            "name": mongo_user.get("name"),
            "tier": str(mongo_user.get("tier", "FREE")).upper(),
            "role": normalized_role,
            "organization_name": mongo_user.get("organization_name"),
            "is_active": bool(mongo_user.get("is_active", True)),
            "is_verified": bool(mongo_user.get("is_verified", False)),
            "email_verified_at": mongo_user.get("email_verified_at"),
            "last_login_at": mongo_user.get("last_login_at"),
            "created_at": created_at,
            "updated_at": updated_at,
            "monthly_limit": int(mongo_user.get("monthly_limit") or 1000),
            "is_admin": is_admin_role(normalized_role) or admin_payload["isPlatformAdmin"],
            "is_platform_admin": admin_payload["isPlatformAdmin"],
            "admin_role": admin_payload["adminRole"],
            "admin_permissions": admin_payload["adminPermissions"],
            "admin_status": admin_payload["adminStatus"],
            "admin_created_at": admin_payload["adminCreatedAt"],
            "admin_last_login_at": admin_payload["adminLastLoginAt"],
            "force_password_change": admin_payload["forcePasswordChange"],
        }
    )


def _require_usable_account(user: dict[str, Any]) -> None:
    if not bool(user.get("is_active", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    if not bool(user.get("is_verified", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")


async def _resolve_user_from_token(token: str) -> CurrentUserContext:
    token_data = decode_token(token, expected_type="access")
    user = await get_user_by_id(str(token_data.user_id))
    if user is None or str(user.get("email", "")).lower() != str(token_data.email).lower():
        raise _credentials_error()
    _require_usable_account(user)
    return _build_current_user_context(user)


def _key_is_expired(key_document: dict[str, Any]) -> bool:
    expires_at = key_document.get("expires_at")
    if not isinstance(expires_at, datetime):
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= _utcnow()


async def _resolve_user_from_api_key(request: Request, raw_key: str) -> CurrentUserContext:
    key_value = str(raw_key or "").strip()
    if not key_value or len(key_value) > 256:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate API key")
    try:
        database = get_database_from_request(request)
        key_hash = hashlib.sha256(key_value.encode("utf-8")).hexdigest()
        key_document = await database.get_collection("keys").find_one(
            {"key_hash": key_hash, "status": {"$in": ["ACTIVE", "active"]}}
        )
    except Exception as exc:
        logger.warning("API key lookup failed error_type=%s", type(exc).__name__)
        raise invalid from exc

    if key_document is None or key_document.get("revoked_at") or _key_is_expired(key_document):
        raise invalid

    user_id = str(key_document.get("user_id") or "")
    user = None
    if ObjectId.is_valid(user_id):
        user = await database.get_collection("users").find_one({"_id": ObjectId(user_id)})
    if user is None and user_id:
        user = await database.get_collection("users").find_one({"id": user_id})
    if user is None:
        raise invalid
    _require_usable_account(user)

    request.state.api_key = {
        "id": key_document.get("id"),
        "prefix": key_document.get("prefix"),
        "user_id": user_id,
    }
    request.state.auth_method = "api_key"

    current_user = _build_current_user_context(user)
    # An API key is a gateway credential, not an admin session. Even if its owner is an admin,
    # requests authenticated by key must never carry admin privileges.
    current_user["is_admin"] = False
    current_user["is_platform_admin"] = False
    current_user["admin_permissions"] = []
    if is_admin_role(current_user["role"]):
        current_user["role"] = normalize_user_role("user")

    try:
        from app.services.dashboard_service import record_audit_event

        await record_audit_event(
            request,
            current_user=current_user,
            action="api_key_used",
            resource="api_key",
            severity="INFO",
            metadata={
                "request_id": getattr(request.state, "request_id", None),
                "api_key_id": key_document.get("id"),
                "api_key_prefix": key_document.get("prefix"),
            },
        )
    except Exception:
        # Auth should not fail because audit persistence is unavailable.
        logger.debug("api_key_used audit failed", exc_info=True)
    return current_user


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    if token:
        request.state.auth_method = "jwt"
        return await _resolve_user_from_token(token)
    api_key = request.headers.get("x-api-key") or request.headers.get("authorization", "").removeprefix("ApiKey ").strip()
    if api_key:
        return await _resolve_user_from_api_key(request, api_key)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_authenticated_user(request: Request, token: str = Depends(oauth2_scheme)):
    return await get_current_user(request, token)


async def get_current_admin(token: str = Depends(oauth2_scheme)):
    # Admin routes accept a JWT session only, never an API key.
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_user = await _resolve_user_from_token(token)
    if not has_platform_admin_access(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account does not have admin panel access.")
    return current_user


async def attach_security_context(request: Request, call_next):
    request.state.user = None
    request.state.api_key = None
    request.state.auth_method = None
    return await call_next(request)
