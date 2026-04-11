from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class AdminPlatformSettings(Base):
    __tablename__ = "admin_platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    enable_gemini_module: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_openai_module: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enable_anthropic_module: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_kill_switch_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_mfa_for_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    admin_rate_limit_window_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    api_key_rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
