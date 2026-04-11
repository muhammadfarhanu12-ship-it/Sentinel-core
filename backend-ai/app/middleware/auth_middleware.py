from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import TierEnum, User, UserRoleEnum
from app.security.roles import ADMIN_ROLE, USER_ROLE, is_admin_role, normalize_user_role
from app.schemas.auth_schema import TokenData
from app.services.auth_service import get_user_by_id
from app.utils.hashing import get_password_hash

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
logger = logging.getLogger(__name__)


class CurrentUserContext(dict):
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _coerce_role(value: Any) -> UserRoleEnum:
    normalized = str(value or "").strip().upper()
    if normalized in UserRoleEnum.__members__:
        return UserRoleEnum.__members__[normalized]
    if is_admin_role(value):
        return UserRoleEnum.ADMIN
    return UserRoleEnum.ANALYST


def _coerce_tier(value: Any) -> TierEnum:
    normalized = str(value or TierEnum.FREE.value).upper()
    return TierEnum.__members__.get(normalized, TierEnum.FREE)


def _ensure_sql_user(
    *,
    email: str,
    name: str | None = None,
    organization_name: str | None = None,
    role: Any = None,
    tier: Any = None,
    is_active: bool = True,
    is_verified: bool = True,
) -> User | None:
    db = SessionLocal()
    try:
        normalized_email = _normalize_email(email)
        user = db.query(User).filter(User.email == normalized_email).first()
        desired_role = _coerce_role(role)
        desired_tier = _coerce_tier(tier)

        if user is None:
            user = User(
                email=normalized_email,
                hashed_password=get_password_hash(secrets.token_urlsafe(32)),
                tier=desired_tier,
                organization_name=organization_name,
                role=desired_role,
                is_active=bool(is_active),
                is_verified=bool(is_verified),
                email_verified_at=_utcnow() if is_verified else None,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return user

        dirty = False
        if organization_name and user.organization_name != organization_name:
            user.organization_name = organization_name
            dirty = True
        if user.role != desired_role:
            user.role = desired_role
            dirty = True
        if user.tier != desired_tier:
            user.tier = desired_tier
            dirty = True
        if bool(user.is_active) != bool(is_active):
            user.is_active = bool(is_active)
            dirty = True
        if bool(user.is_verified) != bool(is_verified):
            user.is_verified = bool(is_verified)
            user.email_verified_at = _utcnow() if is_verified else None
            dirty = True

        if dirty:
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    except SQLAlchemyError:
        db.rollback()
        logger.warning("SQL user synchronization unavailable for email=%s", email, exc_info=True)
        return None
    finally:
        db.close()


def _build_current_user_context(mongo_user: dict[str, Any] | None = None) -> CurrentUserContext:
    if mongo_user is None:
        sql_user = _ensure_sql_user(
            email=settings.DEMO_USER_EMAIL,
            organization_name="sentinel.demo",
            role=UserRoleEnum.ADMIN.value,
            tier=TierEnum.PRO.value,
            is_active=True,
            is_verified=True,
        )
        if sql_user is None:
            identifier = settings.DEMO_USER_EMAIL.lower()
            created_at = _utcnow()
            return CurrentUserContext(
                {
                    "_id": identifier,
                    "id": identifier,
                    "email": settings.DEMO_USER_EMAIL.lower(),
                    "name": None,
                    "tier": TierEnum.PRO.value,
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
        identifier = str(sql_user.id)
        return CurrentUserContext(
            {
                "_id": identifier,
                "id": sql_user.id,
                "email": sql_user.email,
                "name": None,
                "tier": sql_user.tier.value,
                "role": ADMIN_ROLE if sql_user.is_admin else USER_ROLE,
                "organization_name": sql_user.organization_name,
                "is_active": bool(sql_user.is_active),
                "is_verified": bool(sql_user.is_verified),
                "email_verified_at": sql_user.email_verified_at,
                "last_login_at": None,
                "created_at": sql_user.created_at,
                "updated_at": sql_user.created_at,
                "monthly_limit": int(sql_user.monthly_limit or 1000),
                "is_admin": sql_user.is_admin,
            }
        )

    sql_user = _ensure_sql_user(
        email=str(mongo_user.get("email", settings.DEMO_USER_EMAIL)),
        name=mongo_user.get("name"),
        organization_name=mongo_user.get("organization_name"),
        role=mongo_user.get("role"),
        tier=mongo_user.get("tier"),
        is_active=bool(mongo_user.get("is_active", True)),
        is_verified=bool(mongo_user.get("is_verified", False)),
    )
    mongo_identifier = mongo_user.get("_id")
    sql_created_at = sql_user.created_at if sql_user is not None else None
    created_at = mongo_user.get("created_at") or sql_created_at or _utcnow()
    updated_at = mongo_user.get("updated_at") or created_at
    sql_role = sql_user.role.value if sql_user is not None else mongo_user.get("role", USER_ROLE)
    sql_tier = sql_user.tier.value if sql_user is not None else mongo_user.get("tier", TierEnum.FREE.value)
    sql_organization_name = sql_user.organization_name if sql_user is not None else mongo_user.get("organization_name")
    sql_is_active = bool(sql_user.is_active) if sql_user is not None else bool(mongo_user.get("is_active", True))
    sql_is_verified = bool(sql_user.is_verified) if sql_user is not None else bool(mongo_user.get("is_verified", False))
    sql_email_verified_at = sql_user.email_verified_at if sql_user is not None else mongo_user.get("email_verified_at")
    sql_monthly_limit = int(sql_user.monthly_limit or 1000) if sql_user is not None else int(mongo_user.get("monthly_limit") or 1000)
    normalized_role = normalize_user_role(mongo_user.get("role", sql_role))
    identifier = str(mongo_identifier) if mongo_identifier is not None else str(mongo_user.get("id") or mongo_user.get("email"))

    return CurrentUserContext(
        {
            **mongo_user,
            "_id": identifier,
            "id": sql_user.id if sql_user is not None else identifier,
            "email": str(mongo_user.get("email", sql_user.email if sql_user is not None else settings.DEMO_USER_EMAIL)).lower(),
            "name": mongo_user.get("name"),
            "tier": str(mongo_user.get("tier", sql_tier)).upper(),
            "role": normalized_role,
            "organization_name": mongo_user.get("organization_name") or sql_organization_name,
            "is_active": bool(mongo_user.get("is_active", sql_is_active)),
            "is_verified": bool(mongo_user.get("is_verified", sql_is_verified)),
            "email_verified_at": mongo_user.get("email_verified_at") or sql_email_verified_at,
            "last_login_at": mongo_user.get("last_login_at"),
            "created_at": created_at,
            "updated_at": updated_at,
            "monthly_limit": sql_monthly_limit,
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
