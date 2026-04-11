from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base
import enum

class KeyStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"
    QUARANTINED = "QUARANTINED"

class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    # First 12 characters of the raw key (e.g. "sentinel_sk_") to allow indexed lookup.
    # Nullable for legacy rows created before prefix support.
    prefix = Column(String(12), index=True, nullable=True)
    key_hash = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, default="Default Key")
    usage_count = Column(Integer, default=0)
    last_used = Column(DateTime(timezone=True), nullable=True)
    last_ip = Column(String, nullable=True)
    # Auto-flagging / temporary defense actions (enterprise-grade defense pipeline).
    flagged_at = Column(DateTime(timezone=True), nullable=True)
    temp_block_until = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(KeyStatusEnum), default=KeyStatusEnum.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_api_keys_prefix_status", "prefix", "status"),
    )
