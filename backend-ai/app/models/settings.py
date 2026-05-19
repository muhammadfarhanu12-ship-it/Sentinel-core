from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    user_id: str | int
    notifications_enabled: bool = True
    webhook_enabled: bool = False
    ai_guard_enabled: bool = True
    scan_sensitivity: str = "medium"
    auto_redact_pii: bool = True
    block_on_injection: bool = True
    alert_threshold: float = 0.8
    email_alerts: bool = True
    in_app_alerts: bool = True
    max_daily_scans: int = 100
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
