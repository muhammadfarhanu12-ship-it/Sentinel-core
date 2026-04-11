from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RemediationAction(BaseModel):
    type: str = Field(..., max_length=64)
    status: str = Field(..., max_length=16)
    detail: str | None = Field(default=None, max_length=500)
    metadata: dict[str, Any] | None = None


class RemediationLogResponse(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None = None
    api_key_id: int | None = None
    security_log_id: int | None = None
    request_id: str | None = None
    threat_type: str | None = None
    threat_score: float | None = None
    actions: list[RemediationAction]
    email_to: str | None = None
    webhook_urls: list[str] | None = None
    error: str | None = None

    class Config:
        from_attributes = True

