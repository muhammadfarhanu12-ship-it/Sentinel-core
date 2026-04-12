from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class KeyStatusEnum(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    QUARANTINED = "quarantined"


class APIKey(BaseModel):
    id: str
    user_id: str
    name: str
    prefix: str | None = None
    key_hash: str
    status: KeyStatusEnum = KeyStatusEnum.ACTIVE
    usage_count: int = 0
    last_used: datetime | None = None
    last_ip: str | None = None
    created_at: datetime
    updated_at: datetime
