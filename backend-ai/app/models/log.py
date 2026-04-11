from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, JSON, Index
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import enum

Base = declarative_base()

class LogStatusEnum(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    WARNING = "WARNING"
    PENDING = "PENDING"

class SecurityLog(Base):
    __tablename__ = "security_logs"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    status = Column(Enum(LogStatusEnum), nullable=False)
    threat_type = Column(String, nullable=True)
    threat_score = Column(Float, nullable=True)
    tokens_used = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    raw_payload = Column(JSON, nullable=True)  # JSON payload of request/response

    api_key = relationship("APIKey", back_populates="logs")

    __table_args__ = (
        Index("idx_api_key_timestamp", "api_key_id", "timestamp"),
    )

    def __repr__(self):
        return f"<SecurityLog id={self.id} api_key={self.api_key_id} status={self.status} timestamp={self.timestamp}>"