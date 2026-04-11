from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.admin.admin_model import Admin
from app.core.config import settings
from app.core.database import get_db
from app.middleware.rate_limiter import check_rate_limit
from app.models.admin_settings import AdminPlatformSettings

logger = logging.getLogger(__name__)

ADMIN_JWT_AUDIENCE = "sentinelcore-admin"
ADMIN_JWT_ISSUER = "sentinelcore-admin"
ADMIN_TOKEN_TYPE = "admin_access"
ADMIN_ROLE = "admin"
oauth2_scheme_admin = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/login", auto_error=False)


def create_admin_access_token(admin: Admin, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "admin_id": admin.id,
        "sub": admin.email,
        "email": admin.email,
        "role": str(admin.role or ADMIN_ROLE).strip().lower(),
        "type": ADMIN_TOKEN_TYPE,
        "aud": ADMIN_JWT_AUDIENCE,
        "iss": ADMIN_JWT_ISSUER,
        "iat": now,
        "nbf": now,
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_admin_token(token: str) -> dict[str, object]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
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

    token_type = payload.get("type")
    admin_id = payload.get("admin_id")
    if token_type != ADMIN_TOKEN_TYPE or admin_id is None:
        raise credentials_exception
    return {
        "admin_id": int(admin_id),
        "role": str(payload.get("role") or "").strip().lower(),
    }


def get_current_admin(
    request: Request,
    token: str = Depends(oauth2_scheme_admin),
    db: Session = Depends(get_db),
) -> Admin:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_admin_token(token)
    if token_data["role"] != ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    admin_id = int(token_data["admin_id"])
    admin = db.query(Admin).filter(Admin.id == admin_id).first()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not admin.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account is inactive")
    if str(admin.role or "").strip().lower() != ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    platform_settings = db.query(AdminPlatformSettings).order_by(AdminPlatformSettings.id.asc()).first()
    rate_limit = platform_settings.admin_rate_limit_per_minute if platform_settings else 120
    rate_window = platform_settings.admin_rate_limit_window_seconds if platform_settings else 60
    check_rate_limit(f"admin:{admin.id}", scope="admin-authenticated", limit=rate_limit, window_seconds=rate_window)
    request.state.admin = admin
    return admin
