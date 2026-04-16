from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def _resolve_env_value(name: str, aliases: tuple[str, ...] = ()) -> str | None:
    for key in (name, *aliases):
        value = os.getenv(key)
        if value is not None:
            return value
    return None


def _env_str(name: str, default: str | None = None, aliases: tuple[str, ...] = ()) -> str | None:
    raw = _resolve_env_value(name, aliases=aliases)
    if raw is None:
        return default
    cleaned = raw.strip()
    if cleaned == "":
        return default
    return cleaned


def _env_bool(name: str, default: bool, aliases: tuple[str, ...] = ()) -> bool:
    raw = _resolve_env_value(name, aliases=aliases)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    return default


def _env_int(name: str, default: int, aliases: tuple[str, ...] = ()) -> int:
    raw = _resolve_env_value(name, aliases=aliases)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        return default


def _env_float(name: str, default: float, aliases: tuple[str, ...] = ()) -> float:
    raw = _resolve_env_value(name, aliases=aliases)
    if raw is None:
        return default
    try:
        return float(str(raw).strip())
    except Exception:
        return default


class Settings:
    def __init__(self) -> None:
        self.API_KEY_PREFIX: str = _env_str("API_KEY_PREFIX", "sentinel_sk_live_") or "sentinel_sk_live_"
        self.API_KEY_MASK: str = _env_str("API_KEY_MASK", "sentinel_sk_****") or "sentinel_sk_****"

        self.PROJECT_NAME: str = _env_str("PROJECT_NAME", "Sentinel AI Security Gateway") or "Sentinel AI Security Gateway"
        self.API_V1_PREFIX: str = _env_str("API_V1_PREFIX", "/api") or "/api"
        self.MONGODB_URI: str = _env_str("MONGODB_URI", aliases=("MONGO_URI",)) or ""
        self.MONGO_URI: str = self.MONGODB_URI
        self.MONGO_DB_NAME: str = _env_str("MONGO_DB_NAME", "sentinel_dashboard") or "sentinel_dashboard"

        self.JWT_SECRET: str = _env_str("JWT_SECRET", "") or ""
        self.JWT_ALGORITHM: str = _env_str("JWT_ALGORITHM", "HS256") or "HS256"
        self.JWT_ISSUER: str = _env_str("JWT_ISSUER", "sentinelcore") or "sentinelcore"
        self.JWT_AUDIENCE: str = _env_str("JWT_AUDIENCE", "sentinelcore-api") or "sentinelcore-api"
        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = _env_int("ACCESS_TOKEN_EXPIRE_MINUTES", 15)
        self.REFRESH_TOKEN_EXPIRE_MINUTES: int = _env_int("REFRESH_TOKEN_EXPIRE_MINUTES", 10080)
        self.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = _env_int("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", 30)
        self.API_KEY_SECRET: str = _env_str("API_KEY_SECRET", "") or ""

        self.LOG_LEVEL: str = _env_str("LOG_LEVEL", "INFO") or "INFO"
        self.CORS_ORIGINS: str = _env_str("CORS_ORIGINS", "*") or "*"
        self.ENABLE_DEMO_MODE: bool = _env_bool("ENABLE_DEMO_MODE", True)
        self.DEMO_USER_EMAIL: str = _env_str("DEMO_USER_EMAIL", "demo@example.com") or "demo@example.com"
        self.TEST_API_KEY: str = _env_str("TEST_API_KEY", "test_key_123") or "test_key_123"
        self.ADMIN_BOOTSTRAP_EMAIL: str | None = _env_str(
            "ADMIN_BOOTSTRAP_EMAIL",
            aliases=("ADMIN_EMAIL", "SENTINEL_ADMIN_EMAIL"),
        )
        self.ADMIN_BOOTSTRAP_PASSWORD: str | None = _env_str(
            "ADMIN_BOOTSTRAP_PASSWORD",
            aliases=("ADMIN_PASSWORD", "SENTINEL_ADMIN_PASSWORD"),
        )
        self.ADMIN_LOGIN_ALERT_EMAIL: str | None = _env_str(
            "ADMIN_LOGIN_ALERT_EMAIL",
            default=self.ADMIN_BOOTSTRAP_EMAIL,
            aliases=("SENTINEL_ADMIN_ALERT_EMAIL",),
        )

        self.GEMINI_API_KEY: str | None = _env_str("GEMINI_API_KEY")
        self.OPENAI_API_KEY: str | None = _env_str("OPENAI_API_KEY")
        self.AI_PROVIDER: str | None = _env_str("AI_PROVIDER", "gemini")
        self.FALLBACK_AI_PROVIDER: str | None = _env_str("FALLBACK_AI_PROVIDER", "openai")
        self.FRONTEND_URL: str = _env_str("FRONTEND_URL", "http://localhost:5173") or "http://localhost:5173"
        self.BACKEND_PUBLIC_URL: str = _env_str("BACKEND_PUBLIC_URL", "http://localhost:8000") or "http://localhost:8000"
        self.AUTH_VERIFY_EMAIL_PATH: str = _env_str("AUTH_VERIFY_EMAIL_PATH", "/verify-email") or "/verify-email"
        self.AUTH_RESET_PASSWORD_PATH: str = _env_str("AUTH_RESET_PASSWORD_PATH", "/reset-password") or "/reset-password"
        self.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES: int = _env_int("EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES", 30)
        self.AUTH_DEBUG_TOKEN_LOGGING: bool = _env_bool("AUTH_DEBUG_TOKEN_LOGGING", False)
        self.OAUTH_STATE_EXPIRE_MINUTES: int = _env_int("OAUTH_STATE_EXPIRE_MINUTES", 10)
        self.OAUTH_FRONTEND_CALLBACK_PATH: str = _env_str("OAUTH_FRONTEND_CALLBACK_PATH", "/oauth/callback") or "/oauth/callback"
        self.GOOGLE_OAUTH_CLIENT_ID: str | None = _env_str("GOOGLE_OAUTH_CLIENT_ID")
        self.GOOGLE_OAUTH_CLIENT_SECRET: str | None = _env_str("GOOGLE_OAUTH_CLIENT_SECRET")
        self.GOOGLE_OAUTH_SCOPES: str = _env_str("GOOGLE_OAUTH_SCOPES", "openid,email,profile") or "openid,email,profile"
        self.GITHUB_OAUTH_CLIENT_ID: str | None = _env_str("GITHUB_OAUTH_CLIENT_ID")
        self.GITHUB_OAUTH_CLIENT_SECRET: str | None = _env_str("GITHUB_OAUTH_CLIENT_SECRET")
        self.GITHUB_OAUTH_SCOPES: str = _env_str("GITHUB_OAUTH_SCOPES", "read:user,user:email") or "read:user,user:email"
        self.FACEBOOK_OAUTH_CLIENT_ID: str | None = _env_str("FACEBOOK_OAUTH_CLIENT_ID")
        self.FACEBOOK_OAUTH_CLIENT_SECRET: str | None = _env_str("FACEBOOK_OAUTH_CLIENT_SECRET")
        self.FACEBOOK_OAUTH_SCOPES: str = _env_str("FACEBOOK_OAUTH_SCOPES", "email,public_profile") or "email,public_profile"
        self.APPLE_OAUTH_CLIENT_ID: str | None = _env_str("APPLE_OAUTH_CLIENT_ID")
        self.APPLE_OAUTH_TEAM_ID: str | None = _env_str("APPLE_OAUTH_TEAM_ID")
        self.APPLE_OAUTH_KEY_ID: str | None = _env_str("APPLE_OAUTH_KEY_ID")
        self.APPLE_OAUTH_PRIVATE_KEY: str | None = _env_str("APPLE_OAUTH_PRIVATE_KEY")
        self.APPLE_OAUTH_SCOPES: str = _env_str("APPLE_OAUTH_SCOPES", "name,email") or "name,email"
        self.BLOCKED_EMAIL_DOMAINS: str = _env_str("BLOCKED_EMAIL_DOMAINS", "") or ""
        self.AUTH_TEST_FLOW_ENABLED: bool = _env_bool("AUTH_TEST_FLOW_ENABLED", False)

        self.MAX_REQUEST_SIZE_BYTES: int = _env_int("MAX_REQUEST_SIZE_BYTES", 1048576)
        self.MAX_UPLOAD_SIZE_BYTES: int = _env_int("MAX_UPLOAD_SIZE_BYTES", 5242880)
        self.ALLOWED_UPLOAD_TYPES: str = _env_str(
            "ALLOWED_UPLOAD_TYPES",
            "text/plain,application/json,text/csv,application/pdf,application/xml",
        ) or "text/plain,application/json,text/csv,application/pdf,application/xml"
        self.ALLOWED_FILE_EXTENSIONS: str = _env_str("ALLOWED_FILE_EXTENSIONS", ".txt,.json,.csv,.pdf,.xml") or ".txt,.json,.csv,.pdf,.xml"
        self.HSTS_ENABLED: bool = _env_bool("HSTS_ENABLED", True)
        self.HSTS_MAX_AGE: int = _env_int("HSTS_MAX_AGE", 31536000)
        self.HSTS_INCLUDE_SUBDOMAINS: bool = _env_bool("HSTS_INCLUDE_SUBDOMAINS", True)
        self.HSTS_PRELOAD: bool = _env_bool("HSTS_PRELOAD", True)

        self.STRIPE_SECRET_KEY: str | None = _env_str("STRIPE_SECRET_KEY")
        self.STRIPE_WEBHOOK_SECRET: str | None = _env_str("STRIPE_WEBHOOK_SECRET")
        self.STRIPE_PRICE_PRO: str | None = _env_str("STRIPE_PRICE_PRO")
        self.STRIPE_PRICE_BUSINESS: str | None = _env_str("STRIPE_PRICE_BUSINESS")

        self.REMEDIATION_ENABLED: bool = _env_bool("REMEDIATION_ENABLED", True)
        self.REMEDIATION_THREAT_SCORE_THRESHOLD: float = _env_float("REMEDIATION_THREAT_SCORE_THRESHOLD", 0.9)

        self.DEFENSE_WS_ALERT_THRESHOLD: float = _env_float("DEFENSE_WS_ALERT_THRESHOLD", 0.8)
        self.DEFENSE_REPEAT_ATTACK_THRESHOLD: float = _env_float("DEFENSE_REPEAT_ATTACK_THRESHOLD", 0.8)
        self.DEFENSE_REPEAT_ATTACK_WINDOW_SECONDS: int = _env_int("DEFENSE_REPEAT_ATTACK_WINDOW_SECONDS", 600)
        self.DEFENSE_REPEAT_ATTACK_COUNT: int = _env_int("DEFENSE_REPEAT_ATTACK_COUNT", 3)
        self.DEFENSE_TEMP_BLOCK_SECONDS: int = _env_int("DEFENSE_TEMP_BLOCK_SECONDS", 600)
        self.DEFENSE_SANITIZE_THRESHOLD: float = _env_float("DEFENSE_SANITIZE_THRESHOLD", 0.55)
        self.DEFENSE_BLOCK_THRESHOLD: float = _env_float("DEFENSE_BLOCK_THRESHOLD", 0.85)
        self.SCAN_BASE_TIMEOUT_SECONDS: float = _env_float("SCAN_BASE_TIMEOUT_SECONDS", 6.0)
        self.SCAN_MAX_TIMEOUT_SECONDS: float = _env_float("SCAN_MAX_TIMEOUT_SECONDS", 12.0)
        self.SCAN_TIMEOUT_PER_2K_CHARS: float = _env_float("SCAN_TIMEOUT_PER_2K_CHARS", 1.5)
        self.SCAN_RETRY_ATTEMPTS: int = _env_int("SCAN_RETRY_ATTEMPTS", 2)
        self.SCAN_SYNC_LOG_BUDGET_SECONDS: float = _env_float("SCAN_SYNC_LOG_BUDGET_SECONDS", 0.25)
        self.SCAN_SUSPICIOUS_PROMPT_LENGTH: int = _env_int("SCAN_SUSPICIOUS_PROMPT_LENGTH", 4000)

        self.REMEDIATION_EMAIL_ENABLED: bool = _env_bool("REMEDIATION_EMAIL_ENABLED", True)
        self.REMEDIATION_EMAIL_FROM: str | None = _env_str("REMEDIATION_EMAIL_FROM", aliases=("FROM_EMAIL", "EMAIL_FROM"))
        self.REMEDIATION_EMAIL_FROM_NAME: str = _env_str("REMEDIATION_EMAIL_FROM_NAME", "Sentinel Core Alerts") or "Sentinel Core Alerts"
        self.REMEDIATION_EMAIL_TO: str | None = _env_str("REMEDIATION_EMAIL_TO")
        self.SMTP_HOST: str | None = _env_str("SMTP_HOST")
        self.SMTP_PORT: int | None = _env_int("SMTP_PORT", 0) or None
        self.SMTP_USERNAME: str | None = _env_str("SMTP_USERNAME", aliases=("SMTP_USER",))
        self.SMTP_PASSWORD: str | None = _env_str("SMTP_PASSWORD", aliases=("SMTP_PASS",))
        self.SMTP_USE_TLS: bool = _env_bool("SMTP_USE_TLS", True, aliases=("SMTP_TLS",))
        self.SMTP_USE_SSL: bool = _env_bool("SMTP_USE_SSL", False, aliases=("SMTP_SECURE", "SMTP_SSL"))
        self.SMTP_TIMEOUT: int = _env_int("SMTP_TIMEOUT", 10)
        self.SMTP_VERIFY_ON_STARTUP: bool = _env_bool("SMTP_VERIFY_ON_STARTUP", False)

        self.REMEDIATION_WEBHOOK_URLS: str = _env_str("REMEDIATION_WEBHOOK_URLS", "") or ""
        self.REMEDIATION_WEBHOOK_TIMEOUT_SECONDS: float = _env_float("REMEDIATION_WEBHOOK_TIMEOUT_SECONDS", 3.0)

        self.SENTRY_DSN: str | None = _env_str("SENTRY_DSN")
        self.SENTRY_ENVIRONMENT: str = _env_str("SENTRY_ENVIRONMENT", "production") or "production"
        self.SENTRY_TRACES_SAMPLE_RATE: float = _env_float("SENTRY_TRACES_SAMPLE_RATE", 0.1)

        self._normalize_values()
        self._validate_values()

    def _normalize_values(self) -> None:
        verify_path = str(self.AUTH_VERIFY_EMAIL_PATH or "").strip() or "/verify-email"
        reset_path = str(self.AUTH_RESET_PASSWORD_PATH or "").strip() or "/reset-password"
        if not verify_path.startswith("/"):
            verify_path = f"/{verify_path}"
        if not reset_path.startswith("/"):
            reset_path = f"/{reset_path}"

        self.AUTH_VERIFY_EMAIL_PATH = verify_path
        self.AUTH_RESET_PASSWORD_PATH = reset_path
        self.ADMIN_BOOTSTRAP_EMAIL = str(self.ADMIN_BOOTSTRAP_EMAIL or "").strip().lower() or None
        self.ADMIN_LOGIN_ALERT_EMAIL = str(self.ADMIN_LOGIN_ALERT_EMAIL or "").strip().lower() or None

    def _validate_values(self) -> None:
        required = {
            "MONGODB_URI": str(self.MONGODB_URI or "").strip(),
            "JWT_SECRET": str(self.JWT_SECRET or "").strip(),
            "API_KEY_SECRET": str(self.API_KEY_SECRET or "").strip(),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError("Missing required environment variables: " + ", ".join(missing))

        if str(self.JWT_SECRET).lower() in {"change-me", "changeme", "your_secret_here"}:
            raise ValueError("JWT_SECRET must be set to a non-placeholder value")
        if str(self.API_KEY_SECRET).lower() in {"change-me", "changeme", "your_secret_here"}:
            raise ValueError("API_KEY_SECRET must be set to a non-placeholder value")

        if bool(self.ADMIN_BOOTSTRAP_EMAIL) != bool(self.ADMIN_BOOTSTRAP_PASSWORD):
            raise ValueError(
                "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must either both be set or both be omitted"
            )

        api_key_prefix = str(self.API_KEY_PREFIX or "").strip()
        if not api_key_prefix.startswith("sentinel_sk_"):
            raise ValueError("API_KEY_PREFIX must start with 'sentinel_sk_'")
        if not api_key_prefix.endswith("_"):
            raise ValueError("API_KEY_PREFIX must end with '_'")

        email_required = {
            "SMTP_HOST": self.SMTP_HOST,
            "SMTP_PORT": self.SMTP_PORT,
            "SMTP_USER": self.SMTP_USERNAME,
            "SMTP_PASS": self.SMTP_PASSWORD,
            "FROM_EMAIL": self.REMEDIATION_EMAIL_FROM,
        }
        populated = [
            name
            for name, value in email_required.items()
            if value is not None and (not isinstance(value, str) or value.strip())
        ]
        if populated and len(populated) != len(email_required):
            missing_email = [name for name, value in email_required.items() if name not in populated]
            raise ValueError("Missing required email environment variables: " + ", ".join(missing_email))

        if self.SMTP_PORT is not None:
            smtp_port = int(self.SMTP_PORT)
            if smtp_port <= 0 or smtp_port > 65535:
                raise ValueError("SMTP_PORT must be a valid TCP port number")
        if self.SMTP_USE_TLS and self.SMTP_USE_SSL:
            raise ValueError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both")

    @property
    def cors_origins_list(self) -> list[str]:
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
    def allowed_upload_types_list(self) -> list[str]:
        raw = (self.ALLOWED_UPLOAD_TYPES or "").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def allowed_file_extensions_list(self) -> list[str]:
        raw = (self.ALLOWED_FILE_EXTENSIONS or "").strip()
        if not raw:
            return []
        return [ext.strip() for ext in raw.split(",") if ext.strip()]

    @property
    def remediation_webhook_urls_list(self) -> list[str]:
        raw = (self.REMEDIATION_WEBHOOK_URLS or "").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def blocked_email_domains_list(self) -> list[str]:
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


settings = Settings()
