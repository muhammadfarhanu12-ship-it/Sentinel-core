from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ScanJob(BaseModel):
    """Legacy SQL-style compatibility DTO used by admin maintenance tests/tools."""

    id: str | int = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    scan_type: str
    target: str
    status: str = "PENDING"
    result_summary: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
