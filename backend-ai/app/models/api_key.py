from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class KeyStatusEnum(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    QUARANTINED = "quarantined"


class APIKey(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    name: str
    prefix: str | None = None
    key_hash: str
    status: KeyStatusEnum = KeyStatusEnum.ACTIVE
    usage_count: int = 0
    last_used: datetime | None = None
    last_ip: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
