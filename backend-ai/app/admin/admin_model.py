from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class Admin(BaseModel):
    id: str
    email: str
    hashed_password: str
    role: str = "admin"
    is_active: bool = True
    reset_token_hash: str | None = None
    reset_token_expiry: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
