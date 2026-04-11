from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.api_key import KeyStatusEnum
from app.models.security_log import LogStatusEnum
from app.models.user import TierEnum
from app.schemas.user_schema import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validate_password_strength


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminMessageResponse(BaseModel):
    message: str


class AdminForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr


class AdminForgotPasswordResponse(BaseModel):
    message: str
    email_sent: bool = False
    reset_token: str | None = None
    expires_at: datetime | None = None


class AdminResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=255)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class AdminAccessRequestCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    full_name: str | None = Field(default=None, max_length=120)
    organization_name: str | None = Field(default=None, max_length=255)
    reason: str | None = Field(default=None, max_length=1000)


class AdminAccessRequestResponse(BaseModel):
    message: str
    request_id: int | None = None
    status: str = "pending"


class AdminMetricsSeriesPoint(BaseModel):
    label: str
    requests: int = 0
    threats: int = 0


class AdminMetricsResponse(BaseModel):
    total_users: int
    active_users: int
    suspended_users: int
    total_requests: int
    threats_blocked: int
    active_api_keys: int
    quarantined_api_keys: int
    avg_latency_ms: float
    requests_last_7_days: list[AdminMetricsSeriesPoint]


class AdminSystemStatusResponse(BaseModel):
    status: str
    database: str
    uptime_hint: str
    admin_count: int
    last_security_event_at: datetime | None = None


class AdminUserSummary(BaseModel):
    id: int
    email: EmailStr
    tier: TierEnum
    organization_name: str | None = None
    is_active: bool
    monthly_limit: int
    created_at: datetime
    api_usage: int = 0
    api_key_count: int = 0


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminSecurityLogResponse(BaseModel):
    id: int
    timestamp: datetime
    api_key_id: int | None = None
    user_id: int | None = None
    user_email: str | None = None
    status: LogStatusEnum
    threat_type: str | None = None
    threat_types: list[str] | None = None
    threat_score: float | None = None
    risk_score: float | None = None
    attack_vector: str | None = None
    risk_level: str | None = None
    endpoint: str | None = None
    method: str | None = None
    model: str | None = None
    latency_ms: int = 0
    tokens_used: int = 0
    ip_address: str | None = None
    is_quarantined: bool = False
    raw_payload: object | None = None


class AdminApiKeyResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    name: str
    prefix: str | None = None
    status: KeyStatusEnum
    usage_count: int = 0
    last_used: datetime | None = None
    last_ip: str | None = None
    created_at: datetime
    key: str | None = None


class AdminApiKeyCreateRequest(BaseModel):
    user_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)


class AdminSettingsResponse(BaseModel):
    enable_gemini_module: bool
    enable_openai_module: bool
    enable_anthropic_module: bool
    ai_kill_switch_enabled: bool
    require_mfa_for_admin: bool
    admin_rate_limit_per_minute: int
    admin_rate_limit_window_seconds: int
    api_key_rate_limit_per_minute: int
    updated_by_user_id: int | None = None
    updated_at: datetime


class AdminSettingsUpdateRequest(BaseModel):
    enable_gemini_module: bool
    enable_openai_module: bool
    enable_anthropic_module: bool
    ai_kill_switch_enabled: bool
    require_mfa_for_admin: bool
    admin_rate_limit_per_minute: int = Field(ge=10, le=600)
    admin_rate_limit_window_seconds: int = Field(ge=10, le=3600)
    api_key_rate_limit_per_minute: int = Field(ge=10, le=5000)
