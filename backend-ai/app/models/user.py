from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserRoleEnum(str, Enum):
    USER = "user"
    ADMIN = "admin"
    ANALYST = "user"
    SUPER_ADMIN = "admin"


class TierEnum(str, Enum):
    FREE = "FREE"
    PRO = "PRO"
    BUSINESS = "BUSINESS"


class User(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    email: str
    hashed_password: str
    tier: TierEnum = TierEnum.FREE
    organization_name: str | None = None
    role: UserRoleEnum = UserRoleEnum.USER
    is_active: bool = True
    is_verified: bool = False
    monthly_limit: int = 1000
    email_verified_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def is_admin(self) -> bool:
        return self.role == UserRoleEnum.ADMIN
