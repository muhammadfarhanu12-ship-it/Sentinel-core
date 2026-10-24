from __future__ import annotations

import json
import logging
import os
import re
from contextlib import asynccontextmanager
from time import monotonic, perf_counter
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.admin.admin_bootstrap import bootstrap_admin_system
from app.admin.admin_router import router as admin_v1_router
from app.ai_service import get_clean_execution_output
from app.core.config import settings
from app.db.mongo import (
    close_mongo_connection,
    get_mongo_connection_status,
    get_mongo_db_name,
    ping_mongo,
    start_mongo_connection_background,
    wait_for_mongo_ready,
)
from app.middleware.auth_middleware import attach_security_context, get_current_user
from app.middleware.public_rate_limiter import check_public_rate_limit
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes.admin import router as admin_router
from app.routes.auth_routes import router as auth_router
from app.routers.analytics_router import router as analytics_router
from app.routers.audit_logs_router import router as audit_logs_router
from app.routers.billing_router import router as billing_router
from app.routers.brain_router import router as brain_router
from app.routers.contact_router import router as contact_router
from app.routers.email_router import router as email_router
from app.routers.gateway_router import router as gateway_router
from app.routers.keys_router import router as keys_router
from app.routers.log_ws import router as log_ws_router
from app.routers.logs_router import router as logs_router
from app.routers.notification_ws import router as notification_ws_router
from app.routers.notifications_router import router as notifications_router
from app.routers.reports_router import router as reports_router
from app.routers.scan_router import router as scan_router
from app.routers.security_tools_router import router as security_tools_router
from app.routers.settings_router import router as settings_router
from app.routers.team_router import router as team_router
from app.routers.threats_router import router as threats_router
from app.routers.usage_router import router as usage_router
from app.routers.user_router import router as user_router
from app.schemas.api_schema import fail
from app.security.security_enforcement_layer import SecurityEnforcementInput
from app.security.sentinel_core import process_request as process_sentinel_request
from app.security.startup import initialize_security_stack
from app.services.security_service import scan_prompt
from app.services.sentinel_core import build_sentinel_verdict
from app.services.threat_detection import ThreatDetectionService

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Environment flags
# --------------------------------------------------------------------------
IS_PRODUCTION = bool(settings.is_production)

# Set ENABLE_LEGACY_API=false once you confirm the frontend/admin only call /api/v1/*.
ENABLE_LEGACY_API = os.getenv("ENABLE_LEGACY_API", "true").lower() == "true"

# Optional comma-separated list, e.g. "sentinel-core-xcrz.onrender.com". Empty = check disabled.
TRUSTED_HOSTS = [h.strip() for h in os.getenv("TRUSTED_HOSTS", "").split(",") if h.strip()]

CORS_ALLOWED_ORIGINS = settings.cors_origins_list
if IS_PRODUCTION and (not CORS_ALLOWED_ORIGINS or "*" in CORS_ALLOWED_ORIGINS):
    raise RuntimeError("CORS_ORIGINS must list exact origins in production (no wildcard).")

# Explicit lists: wildcard methods/headers combined with credentials is too permissive.
CORS_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-API-Key", "X-Request-ID", "Accept", "Cookie"]

# Legacy /analyze endpoint settings (kept configurable instead of hardcoded).
LEGACY_ANALYZE_PROVIDER = os.getenv("LEGACY_ANALYZE_PROVIDER", "gemini")
LEGACY_ANALYZE_MODEL = os.getenv("LEGACY_ANALYZE_MODEL", "gemini-1.5-flash")

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
SAFE_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,128}$"
MAX_PROMPT_CHARS = 25_000  # hard ceiling (Business plan). Per-plan limits must be enforced in the scan path.
MAX_IMAGE_DATA_CHARS = 2_000_000
MAX_CONTEXT_JSON_BYTES = 8_192


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def _is_admin(user: dict) -> bool:
    """Fail-closed admin check. Adjust keys to match your user document."""
    return bool(user.get("is_admin")) or str(user.get("role", "")).lower() in {"admin", "superadmin"}


def _security_tier_for(user: dict) -> str:
    """Tier comes from the authenticated user context (set in auth_middleware), never from the request."""
    tier = str(user.get("tier") or "FREE").upper()
    return tier if tier in {"FREE", "PRO", "BUSINESS"} else "FREE"


def _strip_error_inputs(detail):
    """Pydantic errors echo the submitted value in `input` (e.g. a password). Never return that."""
    if isinstance(detail, list):
        return [
            {k: v for k, v in item.items() if k not in {"input", "ctx", "url"}} if isinstance(item, dict) else item
            for item in detail
        ]
    return detail


# --------------------------------------------------------------------------
# Pure-ASGI request size limit (works for chunked bodies too, not just Content-Length)
# --------------------------------------------------------------------------
class _BodyTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        body = json.dumps(
            fail(
                code="request_too_large",
                message="Request body exceeds the configured maximum size.",
                details={"max_request_size_bytes": self.max_bytes},
            ).model_dump(mode="json")
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw_length = dict(scope.get("headers") or []).get(b"content-length")
        if raw_length:
            try:
                declared = int(raw_length)
            except ValueError:
                declared = self.max_bytes + 1  # malformed header: treat as oversized
            if declared > self.max_bytes:
                await self._reject(send)
                return

        received = 0
        response_started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        async def tracking_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not response_started:
                await self._reject(send)


# --------------------------------------------------------------------------
# Lifespan
# --------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongodb_client = None
    app.state.database = None
    app.state.mongo_startup_error = None
    app.state.admin_startup_error = None
    app.state.security_startup_error = None
    app.state.security_startup_status = None

    try:
        # Non-blocking: Atlas cold starts can exceed a frontend timeout, so the
        # connection runs in the background and /health reports readiness.
        await start_mongo_connection_background(app=app)
    except Exception as exc:
        app.state.mongo_startup_error = str(exc)
        logger.exception("MongoDB startup failed; continuing in degraded mode")

    try:
        await bootstrap_admin_system()
    except Exception as exc:
        app.state.admin_startup_error = str(exc)
        logger.exception("Admin startup bootstrap failed; continuing without dedicated admin plane")

    # The security stack is the product. In production, never serve traffic without it.
    try:
        security_startup_status = initialize_security_stack()
        app.state.security_startup_status = security_startup_status
        if not bool(security_startup_status.get("ready")):
            app.state.security_startup_error = "Security startup checks failed."
            logger.error(
                "Security startup checks failed failed_modules=%s",
                security_startup_status.get("failed_modules"),
            )
    except Exception as exc:
        app.state.security_startup_error = str(exc)
        logger.exception("Security startup initialization failed")

    if app.state.security_startup_error and IS_PRODUCTION:
        raise RuntimeError("Security stack failed to initialize; refusing to start in production.")

    try:
        yield
    finally:
        try:
            await close_mongo_connection(app=app)
        except TypeError:
            await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
    # No public API docs / schema in production.
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)


# --------------------------------------------------------------------------
# HTTP middleware (registered below in a deliberate order)
# --------------------------------------------------------------------------
_MONGO_COLD_START_SENSITIVE_SUFFIXES = ("/auth/login", "/auth/signup", "/auth/refresh")


async def mongo_cold_start_wait_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and path.endswith(_MONGO_COLD_START_SENSITIVE_SUFFIXES):
        try:
            await wait_for_mongo_ready(timeout_seconds=20.0)
        except RuntimeError as exc:
            logger.warning("Database not ready for cold-start-sensitive request path=%s error=%s", path, exc)
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=fail(
                    code="database_starting_up",
                    message="The server is still starting up. Please try again in a few seconds.",
                ).model_dump(mode="json"),
            )
    return await call_next(request)


async def request_logging_middleware(request: Request, call_next):
    # Never trust a client-supplied ID blindly (log injection / spoofing).
    supplied = request.headers.get("x-request-id", "")
    request_id = supplied if REQUEST_ID_PATTERN.match(supplied) else str(uuid4())
    request.state.request_id = request_id
    started_at = perf_counter()

    # The query string is intentionally NOT logged: it can carry tokens (WebSocket
    # auth, reset links, OAuth codes).
    logger.info(
        "HTTP request started request_id=%s method=%s path=%s",
        request_id, request.method, request.url.path,
    )
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "HTTP request crashed request_id=%s method=%s path=%s",
            request_id, request.method, request.url.path,
        )
        # Returned here (inside CORS + security headers) so browsers see a real 500,
        # not a misleading CORS error.
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=fail(code="internal_error", message="Internal server error").model_dump(mode="json"),
        )

    duration_ms = int((perf_counter() - started_at) * 1000)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "HTTP request finished request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id, request.method, request.url.path, response.status_code, duration_ms,
    )
    return response


# Starlette: the LAST middleware added is the OUTERMOST. Order below, inner -> outer:
# auth context -> cold start -> size limit -> request logging -> security headers -> CORS -> trusted host.
# CORS and security headers wrap everything, so 413/503/500 responses also carry them.
app.middleware("http")(attach_security_context)
app.middleware("http")(mongo_cold_start_wait_middleware)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_SIZE_BYTES)
app.middleware("http")(request_logging_middleware)
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=settings.HSTS_ENABLED,
    hsts_max_age=settings.HSTS_MAX_AGE,
    hsts_include_subdomains=settings.HSTS_INCLUDE_SUBDOMAINS,
    hsts_preload=settings.HSTS_PRELOAD,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_ALLOWED_METHODS,
    allow_headers=CORS_ALLOWED_HEADERS,
    expose_headers=["X-Request-ID"],
    max_age=600,
)
if TRUSTED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)


# --------------------------------------------------------------------------
# Exception handlers
# --------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"loc": list(err.get("loc", [])), "msg": err.get("msg"), "type": err.get("type")}
        for err in exc.errors()
    ]
    # Log field paths and error types only. Never log request bodies: they contain prompts/PII.
    logger.warning(
        "Validation failed request_id=%s method=%s path=%s fields=%s",
        getattr(request.state, "request_id", "unknown"),
        request.method,
        request.url.path,
        [(e["loc"], e["type"]) for e in errors],
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=fail(
            code="validation_error",
            message="Request validation failed",
            details=jsonable_encoder(errors),
        ).model_dump(mode="json"),
    )


# Registered on Starlette's class so routing 404/405 errors use the same envelope.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, (str, dict, list)) else str(exc.detail)
    logger.warning(
        "HTTP exception request_id=%s method=%s path=%s status=%s",
        getattr(request.state, "request_id", "unknown"),
        request.method,
        request.url.path,
        exc.status_code,
    )
    if exc.status_code == status.HTTP_502_BAD_GATEWAY and request.url.path.endswith("/contact"):
        # This route owns a fixed, user-safe recovery message; provider diagnostics stay in logs.
        message, details = "We couldn't send your message. Please try again later or email support@mefyx.com.", None
    elif exc.status_code >= 500:
        message, details = "Internal server error", None
    else:
        details = _strip_error_inputs(detail)
        message = detail if isinstance(detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content=fail(code="http_error", message=message, details=details).model_dump(mode="json"),
        headers=getattr(exc, "headers", None) or None,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=fail(code="internal_error", message="Internal server error").model_dump(mode="json"),
    )


# --------------------------------------------------------------------------
# Routers
# --------------------------------------------------------------------------
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(admin_v1_router)
api_v1.include_router(email_router)
api_v1.include_router(contact_router)
api_v1.include_router(user_router)

app.include_router(admin_router)  # REVIEW: unprefixed admin routes; paste app/routes/admin.py
app.include_router(api_v1)

if ENABLE_LEGACY_API:
    api_legacy = APIRouter(prefix="/api", include_in_schema=False)
    api_legacy.include_router(auth_router)
    api_legacy.include_router(admin_v1_router)
    api_legacy.include_router(email_router)
    api_legacy.include_router(user_router)
    app.include_router(api_legacy)
    app.include_router(security_tools_router, prefix="/api/security", include_in_schema=False)

app.include_router(analytics_router, prefix="/api/v1/analytics")
app.include_router(reports_router, prefix="/api/v1/reports")
app.include_router(threats_router, prefix="/api/v1/threats")
app.include_router(keys_router, prefix="/api/v1/keys")
app.include_router(logs_router, prefix="/api/v1/logs")
app.include_router(team_router, prefix="/api/v1/team")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(usage_router, prefix="/api/v1/usage")
app.include_router(billing_router, prefix="/api/v1/billing")
app.include_router(audit_logs_router, prefix="/api/v1/audit-logs")
app.include_router(notifications_router, prefix="/api/v1/notifications")
app.include_router(gateway_router, prefix="/api/v1/gateway")
app.include_router(brain_router, prefix="/api/v1/brain")
app.include_router(scan_router, prefix="/api/v1/scan")
app.include_router(security_tools_router, prefix="/api/v1/security")
app.include_router(log_ws_router)
app.include_router(notification_ws_router)


# --------------------------------------------------------------------------
# /analyze
# --------------------------------------------------------------------------
class SecurityRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    image_data: str | None = Field(default=None, max_length=MAX_IMAGE_DATA_CHARS)
    session_id: str | None = Field(default=None, pattern=SAFE_ID_PATTERN)
    request_id: str | None = Field(default=None, pattern=SAFE_ID_PATTERN)
    context: dict[str, object] | None = None

    @field_validator("context")
    @classmethod
    def _limit_context_size(cls, value):
        if value is not None and len(json.dumps(value, default=str).encode("utf-8")) > MAX_CONTEXT_JSON_BYTES:
            raise ValueError("context is too large")
        return value


async def analyze(payload: SecurityRequest, request: Request, current_user: dict = Depends(get_current_user)) -> dict[str, object]:
    user_key = str(current_user.get("_id") or current_user.get("id") or current_user.get("email") or "anonymous")
    await check_public_rate_limit(
        user_key, scope="legacy_analyze:user", limit=10, window_seconds=60, request=request,
    )

    tier = _security_tier_for(current_user)
    request_context = dict(payload.context or {})
    if payload.session_id:
        request_context["session_id"] = payload.session_id
    if payload.request_id:
        request_context["request_id"] = payload.request_id

    # These services are synchronous and may call LLMs: run them off the event loop
    # so one slow request cannot stall every other user.
    scan_result = await run_in_threadpool(
        scan_prompt,
        payload.prompt,
        provider=LEGACY_ANALYZE_PROVIDER,
        model=LEGACY_ANALYZE_MODEL,
        security_tier=tier,
        enforcement_input=SecurityEnforcementInput(
            prompt=payload.prompt,
            session_id=payload.session_id,
            metadata={"context": request_context, "request_id": payload.request_id} if request_context or payload.request_id else None,
        ),
    )
    verdict = dict(scan_result.get("sentinel_verdict") or {})

    if verdict.get("execution_output") != "BLOCKED":
        protected_result = await run_in_threadpool(
            process_sentinel_request,
            payload.prompt,
            context=request_context,
            llm_callable=get_clean_execution_output,
        )
        if protected_result.get("verdict") == "block":
            verdict["execution_output"] = "BLOCKED"
            verdict["category"] = "Policy Violation"
            verdict["detail"] = protected_result.get("response")
        elif protected_result.get("response"):
            assessment = await run_in_threadpool(
                ThreatDetectionService().analyze,
                payload.prompt,
                provider=LEGACY_ANALYZE_PROVIDER,
                model=LEGACY_ANALYZE_MODEL,
                security_tier=tier,
            )
            verdict = build_sentinel_verdict(
                assessment,
                execution_output=str(protected_result.get("response") or ""),
                provider=LEGACY_ANALYZE_PROVIDER,
                model=LEGACY_ANALYZE_MODEL,
                security_tier=tier,
            )

        flow = {
            "verdict": protected_result.get("verdict"),
            "risk_score": protected_result.get("risk_score"),
            "risk_level": protected_result.get("risk_level"),
        }
        # Detection internals help attackers tune bypasses: only admins (or non-prod) see them.
        if _is_admin(current_user) or not IS_PRODUCTION:
            flow.update(
                {
                    "context_analysis": protected_result.get("context_analysis"),
                    "anonymization": protected_result.get("anonymization"),
                    "prompt_scan": protected_result.get("prompt_scan"),
                    "logic_check": protected_result.get("logic_check"),
                }
            )
        verdict["protected_flow"] = flow
    return verdict


app.add_api_route("/api/v1/analyze", analyze, methods=["POST"])
if ENABLE_LEGACY_API:
    app.add_api_route("/analyze", analyze, methods=["POST"], include_in_schema=False)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Mefyx AI backend is running."}


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
def _email_is_configured() -> bool:
    required_values = [settings.RESEND_API_KEY, settings.EMAIL_FROM_ADDRESS]
    return all(value is not None and str(value).strip() for value in required_values)


def _summarize_dependency_error(error: str | None) -> str | None:
    if not error:
        return None
    normalized = error.lower()
    if "ssl handshake failed" in normalized:
        return "MongoDB TLS handshake failed. Check the Atlas network allowlist, credentials, and TLS settings."
    if "authentication failed" in normalized:
        return "MongoDB authentication failed. Check MONGODB_URI credentials."
    if "serverselectiontimeouterror" in normalized or "replicasetnoprimary" in normalized:
        return "MongoDB is unreachable. Confirm the cluster is online and accessible."
    return "Dependency error. See server logs."


_HEALTH_TTL_SECONDS = 5.0
_health_cache: dict[str, object] = {"at": 0.0, "database_ok": False, "database_error": None}


async def _check_database() -> tuple[bool, str | None]:
    """Cached so unauthenticated callers cannot turn /health into a DB-ping flood."""
    now = monotonic()
    if now - float(_health_cache["at"]) < _HEALTH_TTL_SECONDS:
        return bool(_health_cache["database_ok"]), _health_cache["database_error"]  # type: ignore[return-value]
    try:
        await ping_mongo()
        ok, error = True, None
    except Exception as exc:
        ok, error = False, str(exc)
    _health_cache.update({"at": now, "database_ok": ok, "database_error": error})
    return ok, error


async def health() -> JSONResponse:
    """Public liveness/readiness: status only, no internals."""
    database_ok, _ = await _check_database()
    security_ok = not getattr(app.state, "security_startup_error", None)
    healthy = database_ok and security_ok
    return JSONResponse(
        status_code=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ok" if healthy else "degraded", "database": "ok" if database_ok else "unavailable"},
    )


async def health_details(current_user: dict = Depends(get_current_user)) -> JSONResponse:
    """Full diagnostics, admins only."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    mongo_status = get_mongo_connection_status()
    database_ok, database_error = await _check_database()
    security_ok = not getattr(app.state, "security_startup_error", None)
    healthy = database_ok and security_ok
    return JSONResponse(
        status_code=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=jsonable_encoder(
            {
                "status": "ok" if healthy else "degraded",
                "database": "ok" if database_ok else "unavailable",
                "database_name": get_mongo_db_name(),
                "database_error": _summarize_dependency_error(database_error or mongo_status.get("last_error")),
                "security": "ok" if security_ok else "degraded",
                "mongo_ready": bool(mongo_status.get("ready")),
                "mongo_last_checked_at": mongo_status.get("last_checked_at"),
                "mongo_last_connected_at": mongo_status.get("last_connected_at"),
                "email_configured": _email_is_configured(),
                "mongo_startup_error": _summarize_dependency_error(getattr(app.state, "mongo_startup_error", None)),
                "security_startup_error": getattr(app.state, "security_startup_error", None),
                "security_startup_status": getattr(app.state, "security_startup_status", None),
            }
        ),
    )


app.add_api_route("/health", health, methods=["GET"])
app.add_api_route("/api/v1/health", health, methods=["GET"])
app.add_api_route("/api/v1/health/details", health_details, methods=["GET"])
if ENABLE_LEGACY_API:
    app.add_api_route("/api/health", health, methods=["GET"], include_in_schema=False)
