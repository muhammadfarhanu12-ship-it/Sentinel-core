import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.core.config import settings


def _create_token(data: dict, token_type: str, expires_delta: timedelta):
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    to_encode.update(
        {
            "exp": expire,
            "iat": now,
            "nbf": now,
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "jti": secrets.token_urlsafe(16),
            "type": token_type,
        }
    )
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    return _create_token(
        data=data,
        token_type="access",
        expires_delta=expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(data: dict, expires_delta: timedelta | None = None):
    return _create_token(
        data=data,
        token_type="refresh",
        expires_delta=expires_delta or timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
    )


def create_password_reset_token(data: dict, expires_delta: timedelta | None = None):
    return _create_token(
        data=data,
        token_type="password_reset",
        expires_delta=expires_delta or timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
    )


def create_email_verification_token(data: dict, expires_delta: timedelta | None = None):
    return _create_token(
        data=data,
        token_type="email_verification",
        expires_delta=expires_delta or timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES),
    )
