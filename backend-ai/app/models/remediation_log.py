from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func

from app.core.database import Base


class RemediationLog(Base):
    __tablename__ = "remediation_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), index=True, nullable=True)
    security_log_id = Column(Integer, ForeignKey("security_logs.id"), index=True, nullable=True)
    request_id = Column(String, nullable=True, index=True)

    threat_type = Column(String, nullable=True)
    threat_score = Column(Float, nullable=True)

    # List of remediation actions taken (or skipped) with status + details.
    actions = Column(JSON, nullable=False, default=list)

    email_to = Column(String, nullable=True)
    webhook_urls = Column(JSON, nullable=True)
    error = Column(String, nullable=True)

    __table_args__ = (
        Index("ix_remediation_logs_user_created_at", "user_id", "created_at"),
        Index("ix_remediation_logs_api_key_created_at", "api_key_id", "created_at"),
    )

