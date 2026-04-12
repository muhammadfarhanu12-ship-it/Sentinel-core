from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminPlatformSettings(BaseModel):
    id: str
    enable_gemini_module: bool = True
    enable_openai_module: bool = True
    enable_anthropic_module: bool = False
    ai_kill_switch_enabled: bool = False
    require_mfa_for_admin: bool = False
    admin_rate_limit_per_minute: int = 120
    admin_rate_limit_window_seconds: int = 60
    api_key_rate_limit_per_minute: int = 600
    updated_by_user_id: str | None = None
    updated_at: datetime
