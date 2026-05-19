from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Usage(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    month: str | None = None
    requests_count: int = 0
    tokens_count: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
