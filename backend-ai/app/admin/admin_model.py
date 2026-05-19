from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Admin(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    email: str
    hashed_password: str
    role: str = "admin"
    is_active: bool = True
    reset_token_hash: str | None = None
    reset_token_expiry: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
