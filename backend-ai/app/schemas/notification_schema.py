from typing import Literal

from pydantic import BaseModel, field_validator
from datetime import datetime

NotificationType = Literal["INFO", "WARNING", "REMEDIATION", "CRITICAL"]


def _normalize_notification_type(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = str(value).strip().upper()
    aliases = {"WARN": "WARNING"}
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in {"INFO", "WARNING", "REMEDIATION", "CRITICAL"} else "INFO"

class NotificationBase(BaseModel):
    title: str
    message: str
    type: NotificationType | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, value: str | None) -> str | None:
        return _normalize_notification_type(value)

class NotificationCreate(NotificationBase):
    type: NotificationType = "INFO"

class NotificationResponse(NotificationBase):
    id: int
    user_id: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
