from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Float
from sqlalchemy.sql import func
from app.core.database import Base

class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scan_type = Column(String, nullable=False, default="prompt")  # prompt / file / url
    target = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="openai")
    model = Column(String, nullable=False, default="gpt-5.4")
    security_tier = Column(String, nullable=False, default="PRO")
    status = Column(String, nullable=False, default="completed")
    threat_score = Column(Float, nullable=True)
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)