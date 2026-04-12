from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminAuditLog(BaseModel):
    id: str
    actor_id: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime
