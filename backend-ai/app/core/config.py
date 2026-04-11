import re
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


class Settings(BaseSettings):
    API_KEY_PREFIX: str = "sentinel_sk_live_"
    API_KEY_MASK: str = "sentinel_sk_****"

    # --- App & DB ---
    PROJECT_NAME: str = "Sentinel AI Security Gateway"
    API_V1_PREFIX: str = "/api"
    DATABASE_URL: str = Field(..., min_length=1)
    MONGO_URI: Optional[str] = Field(default=None)
    MONGO_DB_NAME: str = "sentinel_dashboard"

    # --- JWT / Auth ---
    JWT_SECRET: str = Field(..., min_length=1)
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "sentinelcore"
    JWT_AUDIENCE: str = "sentinelcore-api"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    API_KEY_SECRET: str = Field(..., min_length=1)

    # --- Logging & CORS ---
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "*"  # comma-separated in .env
    ENABLE_DEMO_MODE: bool = True
    DEMO_USER_EMAIL: str = "demo@example.com"
    TEST_API_KEY: str = "test_key_123"
    ADMIN_BOOTSTRAP_EMAIL: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("ADMIN_BOOTSTRAP_EMAIL", "SENTINEL_ADMIN_EMAIL"),
    )
    ADMIN_BOOTSTRAP_PASSWORD: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("ADMIN_BOOTSTRAP_PASSWORD", "SENTINEL_ADMIN_PASSWORD"),
    )

    # --- AI / LLM ---
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    AI_PROVIDER: Optional[str] = "gemini"
    FALLBACK_AI_PROVIDER: Optional[str] = "openai"
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"
    AUTH_VERIFY_EMAIL_PATH: str = "/verify-email"
    AUTH_RESET_PASSWORD_PATH: str = "/reset-password"
    EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES: int = 30
    AUTH_DEBUG_TOKEN_LOGGING: bool = False
    OAUTH_STATE_EXPIRE_MINUTES: int = 10
    OAUTH_FRONTEND_CALLBACK_PATH: str = "/oauth/callback"
    GOOGLE_OAUTH_CLIENT_ID: Optional[str] = None
    GOOGLE_OAUTH_CLIENT_SECRET: Optional[str] = None
    GOOGLE_OAUTH_SCOPES: str = "openid,email,profile"
    GITHUB_OAUTH_CLIENT_ID: Optional[str] = None
    GITHUB_OAUTH_CLIENT_SECRET: Optional[str] = None
    GITHUB_OAUTH_SCOPES: str = "read:user,user:email"
    FACEBOOK_OAUTH_CLIENT_ID: Optional[str] = None
    FACEBOOK_OAUTH_CLIENT_SECRET: Optional[str] = None
    FACEBOOK_OAUTH_SCOPES: str = "email,public_profile"
    APPLE_OAUTH_CLIENT_ID: Optional[str] = None
    APPLE_OAUTH_TEAM_ID: Optional[str] = None
    APPLE_OAUTH_KEY_ID: Optional[str] = None
    APPLE_OAUTH_PRIVATE_KEY: Optional[str] = None
    APPLE_OAUTH_SCOPES: str = "name,email"
    BLOCKED_EMAIL_DOMAINS: str = ""
    AUTH_TEST_FLOW_ENABLED: bool = False

    # --- Upload / Security ---
    MAX_REQUEST_SIZE_BYTES: int = 1048576
    MAX_UPLOAD_SIZE_BYTES: int = 5242880
    ALLOWED_UPLOAD_TYPES: str = "text/plain,application/json,text/csv,application/pdf,application/xml"
    ALLOWED_FILE_EXTENSIONS: str = ".txt,.json,.csv,.pdf,.xml"
    HSTS_ENABLED: bool = True
    HSTS_MAX_AGE: int = 31536000
    HSTS_INCLUDE_SUBDOMAINS: bool = True
    HSTS_PRELOAD: bool = True

    # --- Billing (Stripe) ---
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_PRO: Optional[str] = None
    STRIPE_PRICE_BUSINESS: Optional[str] = None

    # --- Automated remediation ---
    REMEDIATION_ENABLED: bool = True
    REMEDIATION_THREAT_SCORE_THRESHOLD: float = 0.9

    # --- Advanced Defense (Prompt Security Gateway) ---
    # These defaults are safe and preserve backward compatibility unless explicitly tuned via .env.
    DEFENSE_WS_ALERT_THRESHOLD: float = 0.8
    DEFENSE_REPEAT_ATTACK_THRESHOLD: float = 0.8
    DEFENSE_REPEAT_ATTACK_WINDOW_SECONDS: int = 600
    DEFENSE_REPEAT_ATTACK_COUNT: int = 3
    DEFENSE_TEMP_BLOCK_SECONDS: int = 600
    DEFENSE_SANITIZE_THRESHOLD: float = 0.55
    DEFENSE_BLOCK_THRESHOLD: float = 0.85
    SCAN_BASE_TIMEOUT_SECONDS: float = 6.0
    SCAN_MAX_TIMEOUT_SECONDS: float = 12.0
    SCAN_TIMEOUT_PER_2K_CHARS: float = 1.5
    SCAN_RETRY_ATTEMPTS: int = 2
    SCAN_SYNC_LOG_BUDGET_SECONDS: float = 0.25
    SCAN_SUSPICIOUS_PROMPT_LENGTH: int = 4000

    # --- Email alerts (SMTP) ---
    REMEDIATION_EMAIL_ENABLED: bool = True
    REMEDIATION_EMAIL_FROM: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("FROM_EMAIL", "EMAIL_FROM", "REMEDIATION_EMAIL_FROM"),
    )
    REMEDIATION_EMAIL_FROM_NAME: str = "Sentinel Core Alerts"
    REMEDIATION_EMAIL_TO: Optional[str] = None
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[int] = None
    SMTP_USERNAME: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_USER", "SMTP_USERNAME"),
    )
    SMTP_PASSWORD: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_PASS", "SMTP_PASSWORD"),
    )
    SMTP_USE_TLS: bool = Field(
        default=True,
        validation_alias=AliasChoices("SMTP_TLS", "SMTP_USE_TLS"),
    )
    SMTP_USE_SSL: bool = Field(
        default=False,
        validation_alias=AliasChoices("SMTP_SECURE", "SMTP_SSL", "SMTP_USE_SSL"),
    )
    SMTP_TIMEOUT: int = 10
    SMTP_VERIFY_ON_STARTUP: bool = False

    # --- Webhooks ---
    REMEDIATION_WEBHOOK_URLS: str = ""
    REMEDIATION_WEBHOOK_TIMEOUT_SECONDS: float = 3.0

    # --- Monitoring / Sentry ---
    SENTRY_DSN: Optional[str] = None
    SENTRY_ENVIRONMENT: str = "production"
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    @model_validator(mode="after")
    def validate_security_settings(self):
        for field_name in ("DATABASE_URL", "JWT_SECRET", "API_KEY_SECRET"):
            value = str(getattr(self, field_name) or "").strip()
            if not value:
                raise ValueError(f"{field_name} is required")

        if self.JWT_SECRET.lower() in {"change-me", "changeme", "your_secret_here"}:
            raise ValueError("JWT_SECRET must be set to a non-placeholder value")
        if self.API_KEY_SECRET.lower() in {"change-me", "changeme", "your_secret_here"}:
            raise ValueError("API_KEY_SECRET must be set to a non-placeholder value")

        admin_email = str(self.ADMIN_BOOTSTRAP_EMAIL or "").strip()
        admin_password = str(self.ADMIN_BOOTSTRAP_PASSWORD or "").strip()
        if bool(admin_email) != bool(admin_password):
            raise ValueError(
                "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must either both be set or both be omitted"
            )

        api_key_prefix = str(self.API_KEY_PREFIX or "").strip()
        if not api_key_prefix.startswith("sentinel_sk_"):
            raise ValueError("API_KEY_PREFIX must start with 'sentinel_sk_'")
        if not api_key_prefix.endswith("_"):
            raise ValueError("API_KEY_PREFIX must end with '_'")

        return self

    @model_validator(mode="after")
    def validate_email_settings(self):
        required = {
            "SMTP_HOST": self.SMTP_HOST,
            "SMTP_PORT": self.SMTP_PORT,
            "SMTP_USER": self.SMTP_USERNAME,
            "SMTP_PASS": self.SMTP_PASSWORD,
            "FROM_EMAIL": self.REMEDIATION_EMAIL_FROM,
        }
        populated = [
            name for name, value in required.items()
            if value is not None and (not isinstance(value, str) or value.strip())
        ]
        if populated and len(populated) != len(required):
            missing = [name for name, value in required.items() if name not in populated]
            raise ValueError("Missing required email environment variables: " + ", ".join(missing))

        if self.SMTP_PORT is not None:
            smtp_port = int(self.SMTP_PORT)
            if smtp_port <= 0 or smtp_port > 65535:
                raise ValueError("SMTP_PORT must be a valid TCP port number")
        if self.SMTP_USE_TLS and self.SMTP_USE_SSL:
            raise ValueError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both")
        return self

    @model_validator(mode="after")
    def normalize_auth_paths(self):
        verify_path = str(self.AUTH_VERIFY_EMAIL_PATH or "").strip() or "/verify-email"
        reset_path = str(self.AUTH_RESET_PASSWORD_PATH or "").strip() or "/reset-password"
        if not verify_path.startswith("/"):
            verify_path = f"/{verify_path}"
        if not reset_path.startswith("/"):
            reset_path = f"/{reset_path}"

        object.__setattr__(self, "AUTH_VERIFY_EMAIL_PATH", verify_path)
        object.__setattr__(self, "AUTH_RESET_PASSWORD_PATH", reset_path)
        return self

    @model_validator(mode="after")
    def normalize_bootstrap_admin_email(self):
        email = str(self.ADMIN_BOOTSTRAP_EMAIL or "").strip().lower()
        object.__setattr__(self, "ADMIN_BOOTSTRAP_EMAIL", email or None)
        return self

    @model_validator(mode="after")
    def normalize_database_url(self):
        prefix = "sqlite:///"
        database_url = str(self.DATABASE_URL or "").strip()
        if not database_url.lower().startswith(prefix):
            return self

        raw_path = database_url[len(prefix):]
        if not raw_path or raw_path == ":memory:" or raw_path.startswith("file:"):
            return self

        path_part, separator, suffix = raw_path.partition("?")
        if Path(path_part).is_absolute() or re.match(r"^[A-Za-z]:[\\/]", path_part):
            return self

        resolved_path = (BACKEND_ROOT / path_part).resolve()
        normalized_url = f"{prefix}{resolved_path.as_posix()}"
        if separator:
            normalized_url = f"{normalized_url}?{suffix}"

        object.__setattr__(self, "DATABASE_URL", normalized_url)
        return self

    # --- Properties for list parsing ---
    @property
    def cors_origins_list(self) -> List[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw or raw == "*":
            return [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5174",
            ]
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        for origin in (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ):
            if origin not in origins:
                origins.append(origin)
        return origins

    @property
    def allowed_upload_types_list(self) -> List[str]:
        raw = (self.ALLOWED_UPLOAD_TYPES or "").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def allowed_file_extensions_list(self) -> List[str]:
        raw = (self.ALLOWED_FILE_EXTENSIONS or "").strip()
        if not raw:
            return []
        return [ext.strip() for ext in raw.split(",") if ext.strip()]

    @property
    def remediation_webhook_urls_list(self) -> List[str]:
        raw = (self.REMEDIATION_WEBHOOK_URLS or "").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def blocked_email_domains_list(self) -> List[str]:
        raw = (self.BLOCKED_EMAIL_DOMAINS or "").strip().lower()
        if not raw:
            return []
        return [domain.strip() for domain in raw.split(",") if domain.strip()]

    @property
    def smtp_timeout_seconds(self) -> float:
        raw_timeout = int(self.SMTP_TIMEOUT or 10)
        if raw_timeout > 120:
            return max(raw_timeout / 1000.0, 5.0)
        return max(float(raw_timeout), 5.0)

    @property
    def sqlite_database_path(self) -> str | None:
        prefix = "sqlite:///"
        database_url = str(self.DATABASE_URL or "").strip()
        if not database_url.lower().startswith(prefix):
            return None
        raw_path = database_url[len(prefix):]
        if not raw_path or raw_path == ":memory:" or raw_path.startswith("file:"):
            return None
        return raw_path.partition("?")[0]

    # --- Pydantic config ---
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="allow"  # allow extra keys in .env
    )


# Singleton instance
settings = Settings()
