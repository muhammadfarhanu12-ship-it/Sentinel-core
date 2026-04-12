from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class UserRoleEnum(str, Enum):
    ADMIN = "admin"
    ANALYST = "user"


class TierEnum(str, Enum):
    FREE = "FREE"
    PRO = "PRO"
    BUSINESS = "BUSINESS"


class User(BaseModel):
    id: str
    email: str
    hashed_password: str
    tier: TierEnum = TierEnum.FREE
    organization_name: str | None = None
    role: UserRoleEnum = UserRoleEnum.ANALYST
    is_active: bool = True
    is_verified: bool = False
    email_verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @property
    def is_admin(self) -> bool:
        return self.role == UserRoleEnum.ADMIN
