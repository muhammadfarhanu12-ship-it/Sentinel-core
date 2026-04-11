from datetime import timedelta

from app.core.config import settings
from app.utils.token_generator import create_access_token


def create_user_access_token(subject: str, expires_minutes: int | None = None):
    lifetime = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    return create_access_token(
        data={"sub": subject},
        expires_delta=timedelta(minutes=lifetime),
    )


__all__ = ["create_access_token", "create_user_access_token"]
