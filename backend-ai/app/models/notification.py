from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Notification(BaseModel):
    """Legacy SQL-style compatibility DTO used by admin maintenance tests/tools."""

    id: str | int = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    title: str
    message: str
    type: str = "INFO"
    read: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
