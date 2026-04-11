from __future__ import annotations

from pydantic import BaseModel, Field


class UserSettingsUpdate(BaseModel):
    scan_sensitivity: str | None = Field(default=None, max_length=20)
    auto_redact_pii: bool | None = None
    block_on_injection: bool | None = None
    alert_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    email_alerts: bool | None = None
    in_app_alerts: bool | None = None
    max_daily_scans: int | None = Field(default=None, ge=1, le=1000000)


class UserSettingsResponse(BaseModel):
    scan_sensitivity: str
    auto_redact_pii: bool
    block_on_injection: bool
    alert_threshold: float
    email_alerts: bool
    in_app_alerts: bool
    max_daily_scans: int

    class Config:
        from_attributes = True

