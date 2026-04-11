from typing import Optional, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.security_log import LogStatusEnum


# 🔹 Base shared fields
class LogBase(BaseModel):
    id: int
    api_key_id: Optional[int] = None
    timestamp: datetime
    status: LogStatusEnum

    threat_type: Optional[str] = None
    threat_types: Optional[List[str]] = None
    threat_score: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)
    attack_vector: Optional[str] = None
    risk_level: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")
    detection_stage_triggered: Optional[List[str]] = None

    tokens_used: int = 0
    latency_ms: int = 0

    # 🔥 NEW FIELDS (CRITICAL)
    request_id: Optional[str] = None
    ip_address: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    model: Optional[str] = None
    risk_score: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)
    is_quarantined: Optional[bool] = False

    class Config:
        from_attributes = True


# 🔹 SAFE response (used in list view)
class LogResponse(LogBase):
    """
    Safe log response (no sensitive payload)
    """
    pass


# 🔹 Detailed log (expand view in frontend)
class LogDetailResponse(LogBase):
    """
    Includes sanitized payload only
    """
    raw_payload: Optional[Any] = None


# 🔹 Pagination response (IMPORTANT)
class LogListResponse(BaseModel):
    logs: List[LogResponse]
    total: int
    limit: int
    offset: int


# 🔹 Filter schema (for future use)
class LogFilter(BaseModel):
    status: Optional[LogStatusEnum] = None
    threat_type: Optional[str] = None
    api_key_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


# Backwards-compatible alias used by older routers.
SecurityLogResponse = LogResponse
