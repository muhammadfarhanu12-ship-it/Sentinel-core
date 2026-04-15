from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from time import perf_counter
from urllib.parse import parse_qs
from uuid import uuid4

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import get_security_analysis
from app.admin.admin_bootstrap import bootstrap_admin_system
from app.admin.admin_router import router as admin_v1_router
from app.ai_service import get_clean_execution_output
from app.core.config import settings
from app.db.mongo import (
    close_mongo_connection,
    connect_to_mongo,
    get_mongo_connection_status,
    get_mongo_db_name,
    ping_mongo,
)
from app.middleware.auth_middleware import attach_security_context
from app.routes.admin import router as admin_router
from app.routes.auth_routes import router as auth_router
from app.routers.analytics_router import router as analytics_router
from app.routers.audit_logs_router import router as audit_logs_router
from app.routers.billing_router import router as billing_router
from app.routers.brain_router import router as brain_router
from app.routers.email_router import router as email_router
from app.routers.keys_router import router as keys_router
from app.routers.logs_router import router as logs_router
from app.routers.user_router import router as user_router
from app.routers.log_ws import router as log_ws_router
from app.routers.notification_ws import router as notification_ws_router
from app.routers.notifications_router import router as notifications_router
from app.routers.reports_router import router as reports_router
from app.routers.scan_router import router as scan_router
from app.routers.settings_router import router as settings_router
from app.routers.team_router import router as team_router
from app.routers.usage_router import router as usage_router
from app.schemas.api_schema import fail
from app.services.email_service import verify_smtp_connection
from app.services.sentinel_core import build_sentinel_verdict
from app.services.threat_detection import ThreatDetectionService
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
SENSITIVE_REQUEST_FIELDS = {
    "password",
    "new_password",
    "token",
    "refresh_token",
    "access_token",
}


def _redact_request_data(value):
    if isinstance(value, dict):
        sanitized: dict[str, object] = {}
        for key, item in value.items():
            lowered = key.lower()
            if lowered in SENSITIVE_REQUEST_FIELDS or lowered.endswith("_token"):
                item_string = str(item)
                sanitized[key] = {
                    "present": True,
                    "length": len(item_string),
                }
                continue
            sanitized[key] = _redact_request_data(item)
        return sanitized
    if isinstance(value, list):
        return [_redact_request_data(item) for item in value]
    return value


def _safe_request_body_preview(body: bytes, content_type: str) -> object:
    if not body:
        return None

    try:
        if "application/json" in content_type:
            return _redact_request_data(json.loads(body.decode("utf-8")))
        if "application/x-www-form-urlencoded" in content_type:
            parsed = parse_qs(body.decode("utf-8"), keep_blank_values=True)
            flattened = {
                key: values[0] if len(values) == 1 else values
                for key, values in parsed.items()
            }
            return _redact_request_data(flattened)
    except Exception:
        logger.debug("Failed to parse request body preview for logging", exc_info=True)

    preview = body[:512].decode("utf-8", errors="replace")
    return preview if len(body) <= 512 else f"{preview}..."


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongodb_client = None
    app.state.database = None
    app.state.mongo_startup_error = None
    app.state.smtp_startup_error = None
    app.state.admin_startup_error = None

    try:
        await connect_to_mongo(app=app)
    except Exception as exc:
        app.state.mongo_startup_error = str(exc)
        logger.exception("MongoDB startup failed; continuing in degraded mode")

    try:
        await bootstrap_admin_system()
    except Exception as exc:
        app.state.admin_startup_error = str(exc)
        logger.exception("Admin startup bootstrap failed; continuing without dedicated admin plane")

    if settings.SMTP_VERIFY_ON_STARTUP:
        try:
            verify_smtp_connection()
        except Exception as exc:
            app.state.smtp_startup_error = str(exc)
            logger.exception("SMTP startup verification failed; continuing in degraded mode")

    try:
        yield
    finally:
        await close_mongo_connection(app=app)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    "https://sentinel-core-arei.vercel.app",   # MAIN FRONTEND (missing right now ❌)
    "https://sentinel-admin-beta.vercel.app",  # ADMIN FRONTEND
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(attach_security_context)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    started_at = perf_counter()
    logger.info(
        "HTTP request started request_id=%s method=%s path=%s query=%s content_type=%s",
        request_id,
        request.method,
        request.url.path,
        request.url.query,
        request.headers.get("content-type", ""),
    )
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "HTTP request crashed request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        raise

    duration_ms = int((perf_counter() - started_at) * 1000)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "HTTP request finished request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    body_preview = _safe_request_body_preview(await request.body(), request.headers.get("content-type", "").lower())
    logger.warning(
        "Validation failed request_id=%s method=%s path=%s query=%s body=%s errors=%s",
        getattr(request.state, "request_id", "unknown"),
        request.method,
        request.url.path,
        request.url.query,
        body_preview,
        exc.errors(),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=fail(
            code="validation_error",
            message="Request validation failed",
            details=exc.errors(),
        ).model_dump(mode="json"),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, (str, dict, list)) else str(exc.detail)
    logger.warning(
        "HTTP exception request_id=%s method=%s path=%s status=%s detail=%s",
        getattr(request.state, "request_id", "unknown"),
        request.method,
        request.url.path,
        exc.status_code,
        detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=fail(code="http_error", message=str(detail), details=detail).model_dump(mode="json"),
        headers=getattr(exc, "headers", None) or None,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=fail(code="internal_error", message="Internal server error").model_dump(mode="json"),
    )


api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(admin_v1_router)
api_v1.include_router(email_router)
api_v1.include_router(user_router)

api_legacy = APIRouter(prefix="/api", include_in_schema=False)
api_legacy.include_router(auth_router)
api_legacy.include_router(admin_v1_router)
api_legacy.include_router(email_router)
api_legacy.include_router(user_router)

app.include_router(admin_router)
app.include_router(api_v1)
app.include_router(api_legacy)
app.include_router(analytics_router, prefix="/api/v1/analytics")
app.include_router(reports_router, prefix="/api/v1/reports")
app.include_router(keys_router, prefix="/api/v1/keys")
app.include_router(logs_router, prefix="/api/v1/logs")
app.include_router(team_router, prefix="/api/v1/team")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(usage_router, prefix="/api/v1/usage")
app.include_router(billing_router, prefix="/api/v1/billing")
app.include_router(audit_logs_router, prefix="/api/v1/audit-logs")
app.include_router(notifications_router, prefix="/api/v1/notifications")
app.include_router(brain_router, prefix="/api/v1/brain")
app.include_router(scan_router, prefix="/api/v1/scan")
app.include_router(log_ws_router)
app.include_router(notification_ws_router)


class SecurityRequest(BaseModel):
    prompt: str
    image_data: str | None = None


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Sentinel backend is running."}


@app.post("/analyze", include_in_schema=False)
@app.post("/api/v1/analyze")
async def analyze(payload: SecurityRequest) -> dict[str, object]:
    assessment = ThreatDetectionService().analyze(payload.prompt, security_tier="PRO")
    verdict = build_sentinel_verdict(assessment)
    if verdict["execution_output"] != "BLOCKED":
        execution_output = get_clean_execution_output(payload.prompt)
        if execution_output:
            verdict = build_sentinel_verdict(assessment, execution_output=execution_output)
    return verdict


def _smtp_is_configured() -> bool:
    required_values = [
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        settings.SMTP_USERNAME,
        settings.SMTP_PASSWORD,
        settings.REMEDIATION_EMAIL_FROM,
    ]
    return all(value is not None and str(value).strip() for value in required_values)


def _summarize_dependency_error(error: str | None) -> str | None:
    if not error:
        return None

    normalized = error.lower()
    if "ssl handshake failed" in normalized:
        return "MongoDB TLS handshake failed. Check the Atlas network allowlist, credentials, and TLS settings in backend-ai/.env."
    if "authentication failed" in normalized:
        return "MongoDB authentication failed. Check MONGODB_URI username/password in backend-ai/.env."
    if "serverselectiontimeouterror" in normalized or "replicasetnoprimary" in normalized:
        return "MongoDB is unreachable. Confirm the cluster is online and accessible from this machine."
    return error


@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/health", include_in_schema=False)
async def health(response: Response) -> dict[str, object]:
    mongo_status = get_mongo_connection_status()
    database_state = "ok"
    database_error: str | None = None

    try:
        await ping_mongo()
    except Exception as exc:
        database_state = "unavailable"
        database_error = str(exc)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    overall_status = "ok" if database_state == "ok" else "degraded"
    if overall_status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": overall_status,
        "database": database_state,
        "database_name": get_mongo_db_name(),
        "database_error": _summarize_dependency_error(database_error or mongo_status.get("last_error")),
        "mongo_ready": bool(mongo_status.get("ready")),
        "mongo_last_checked_at": mongo_status.get("last_checked_at"),
        "mongo_last_connected_at": mongo_status.get("last_connected_at"),
        "smtp_configured": _smtp_is_configured(),
        "smtp_verify_on_startup": settings.SMTP_VERIFY_ON_STARTUP,
        "smtp_startup_error": getattr(app.state, "smtp_startup_error", None),
        "mongo_startup_error": _summarize_dependency_error(getattr(app.state, "mongo_startup_error", None)),
    }
