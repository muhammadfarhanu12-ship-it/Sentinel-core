from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class AdminAccessRequest(Base):
    __tablename__ = "admin_access_requests"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    full_name = Column(String(120), nullable=True)
    organization_name = Column(String(255), nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(32), default="pending", server_default="pending", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
