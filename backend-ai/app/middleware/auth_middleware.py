from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.schemas.auth_schema import TokenData
from app.security.roles import ADMIN_ROLE, is_admin_role, normalize_user_role
from app.services.auth_service import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class CurrentUserContext(dict):
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def decode_token(token: str, expected_type: str = "access") -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
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
    except JWTError as exc:
        raise credentials_exception from exc


def _build_current_user_context(mongo_user: dict[str, Any] | None = None) -> CurrentUserContext:
    if mongo_user is None:
        created_at = _utcnow()
        return CurrentUserContext(
            {
                "_id": settings.DEMO_USER_EMAIL.lower(),
                "id": settings.DEMO_USER_EMAIL.lower(),
                "email": settings.DEMO_USER_EMAIL.lower(),
                "name": None,
                "tier": "PRO",
                "role": ADMIN_ROLE,
                "organization_name": "sentinel.demo",
                "is_active": True,
                "is_verified": True,
                "email_verified_at": created_at,
                "last_login_at": None,
                "created_at": created_at,
                "updated_at": created_at,
                "monthly_limit": 1000,
                "is_admin": True,
            }
        )

    identifier = str(mongo_user.get("_id") or mongo_user.get("id") or mongo_user.get("email"))
    created_at = mongo_user.get("created_at") or _utcnow()
    updated_at = mongo_user.get("updated_at") or created_at
    normalized_role = normalize_user_role(mongo_user.get("role"))

    return CurrentUserContext(
        {
            **mongo_user,
            "_id": identifier,
            "id": identifier,
            "email": str(mongo_user.get("email", settings.DEMO_USER_EMAIL)).lower(),
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
            "is_admin": is_admin_role(normalized_role),
        }
    )


async def _resolve_user_from_token(token: str) -> CurrentUserContext:
    token_data = decode_token(token, expected_type="access")
    user = await get_user_by_id(str(token_data.user_id))
    if user is None or str(user.get("email", "")).lower() != str(token_data.email).lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not bool(user.get("is_active", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    return _build_current_user_context(user)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    if token:
        return await _resolve_user_from_token(token)
    if settings.ENABLE_DEMO_MODE:
        return _build_current_user_context()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_authenticated_user(token: str = Depends(oauth2_scheme)):
    return await get_current_user(token)


async def get_current_admin(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_user = await _resolve_user_from_token(token)
    if not bool(current_user.get("is_verified", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    if not is_admin_role(current_user.get("role")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def attach_security_context(request: Request, call_next):
    request.state.user = None
    request.state.api_key = None
    response = await call_next(request)
    return response
