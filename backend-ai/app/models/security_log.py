from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class LogStatusEnum(str, Enum):
    CLEAN = "CLEAN"
    BLOCKED = "BLOCKED"
    REDACTED = "REDACTED"
    ALLOWED = "CLEAN"


class SecurityLog(BaseModel):
    id: str
    timestamp: datetime
    user_id: str | None = None
    user_email: str | None = None
    api_key_id: str | None = None
    status: LogStatusEnum = LogStatusEnum.CLEAN
    threat_type: str | None = None
    threat_types: list[str] | None = None
    threat_score: float | None = None
    risk_score: float | None = None
    risk_level: str | None = None
    attack_vector: str | None = None
    endpoint: str | None = None
    method: str | None = None
    model: str | None = None
    latency_ms: int = 0
    tokens_used: int = 0
    ip_address: str | None = None
    is_quarantined: bool = False
    raw_payload: Any | None = None
