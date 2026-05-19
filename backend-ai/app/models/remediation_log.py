from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RemediationLog(BaseModel):
    """Legacy SQL-style compatibility DTO used by admin maintenance tests/tools."""

    id: str | int = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int | None = None
    organization_id: str | None = None
    project_id: str | None = None
    api_key_id: str | int | None = None
    security_log_id: str | int | None = None
    request_id: str | None = None
    issue_type: str | None = None
    threat_type: str | None = None
    severity: str = "HIGH"
    status: str = "OPEN"
    affected_resource: str | None = None
    recommendation: str | None = None
    threat_score: float | None = None
    actions: list[dict[str, Any]] = Field(default_factory=list)
    email_to: str | None = None
    webhook_urls: list[str] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
