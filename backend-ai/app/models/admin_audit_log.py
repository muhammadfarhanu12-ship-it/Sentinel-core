from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AdminAuditLog(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    actor_id: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=_now)
