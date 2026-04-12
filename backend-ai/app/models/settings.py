from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserSettings(BaseModel):
    id: str
    user_id: str
    notifications_enabled: bool = True
    webhook_enabled: bool = False
    ai_guard_enabled: bool = True
    created_at: datetime
    updated_at: datetime
