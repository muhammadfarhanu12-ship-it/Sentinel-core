from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminAccessRequest(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    organization_name: str | None = None
    reason: str | None = None
    status: str = "pending"
    created_at: datetime
    updated_at: datetime
