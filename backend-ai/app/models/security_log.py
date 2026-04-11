from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func
from app.core.database import Base
import enum

class LogStatusEnum(str, enum.Enum):
    CLEAN = "CLEAN"
    BLOCKED = "BLOCKED"
    REDACTED = "REDACTED"

class SecurityLog(Base):
    __tablename__ = "security_logs"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), index=True, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(LogStatusEnum), nullable=False)
    threat_type = Column(String, nullable=True)
    # Multi-label classification (enterprise upgrade). Stored as JSON array for cross-DB compatibility.
    threat_types = Column(JSON, nullable=True)
    threat_score = Column(Float, nullable=True)
    attack_vector = Column(String, nullable=True)
    risk_level = Column(String, nullable=True)  # low|medium|high
    detection_stage_triggered = Column(JSON, nullable=True)  # list of stage ids
    tokens_used = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    raw_payload = Column(JSON, nullable=True)

    request_id = Column(String, nullable=True, index=True)
    ip_address = Column(String, nullable=True, index=True)
    endpoint = Column(String, nullable=True, index=True)
    method = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True)
    risk_score = Column(Float, nullable=True)
    is_quarantined = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_security_logs_api_key_timestamp", "api_key_id", "timestamp"),
        Index("ix_security_logs_status_timestamp", "status", "timestamp"),
    )
