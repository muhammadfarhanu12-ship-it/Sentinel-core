from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class Usage(BaseModel):
    id: str
    user_id: str
    requests_count: int = 0
    created_at: datetime
    updated_at: datetime
