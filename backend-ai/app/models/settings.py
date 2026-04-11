# app/models/settings.py
from sqlalchemy import ForeignKey, String, Boolean, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    # Scan preferences
    scan_sensitivity: Mapped[str] = mapped_column(String(20), default="medium")
    auto_redact_pii: Mapped[bool] = mapped_column(Boolean, default=True)
    block_on_injection: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_threshold: Mapped[float] = mapped_column(Float, default=0.75)

    # Notifications
    email_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_alerts: Mapped[bool] = mapped_column(Boolean, default=True)

    # Quotas
    max_daily_scans: Mapped[int] = mapped_column(Integer, default=100)