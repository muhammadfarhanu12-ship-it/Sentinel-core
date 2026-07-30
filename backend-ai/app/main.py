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
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes.admin import router as admin_router
from app.routes.auth_routes import router as auth_router
from app.routers.analytics_router import router as analytics_router
from app.routers.audit_logs_router import router as audit_logs_router
from app.routers.billing_router import router as billing_router
from app.routers.brain_router import router as brain_router
from app.routers.email_router import router as email_router
from app.routers.gateway_router import router as gateway_router
from app.routers.keys_router import router as keys_router
from app.routers.logs_router import router as logs_router
from app.routers.user_router import router as user_router
from app.routers.log_ws import router as log_ws_router
from app.routers.notification_ws import router as notification_ws_router
from app.routers.notifications_router import router as notifications_router
from app.routers.reports_router import router as reports_router
from app.routers.scan_router import router as scan_router
from app.routers.security_tools_router import router as security_tools_router
from app.routers.settings_router import router as settings_router
from app.routers.team_router import router as team_router
from app.routers.threats_router import router as threats_router
from app.routers.usage_router import router as usage_router
from app.schemas.api_schema import fail
from app.security.security_enforcement_layer import SecurityEnforcementInput
from app.security.sentinel_core import process_request as process_sentinel_request
from app.security.startup import initialize_security_stack
from app.services.email_service import verify_smtp_connection
from app.services.security_service import scan_prompt
from app.services.sentinel_core import build_sentinel_verdict
from app.services.threat_detection import ThreatDetectionService
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
CORS_ALLOWED_ORIGINS = settings.cors_origins_list
CORS_ALLOWED_METHODS = ["*"]
CORS_ALLOWED_HEADERS = ["*"]
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
    app.state.security_startup_error = None
    app.state.security_startup_status = None

    try:
        try:
            await connect_to_mongo(app=app)
        except TypeError:
            await connect_to_mongo()
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
        logger.exception("Security startup initialization failed; continuing in degraded mode")

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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_ALLOWED_METHODS,
    allow_headers=CORS_ALLOWED_HEADERS,
    max_age=600,
)
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=settings.HSTS_ENABLED,
    hsts_max_age=settings.HSTS_MAX_AGE,
    hsts_include_subdomains=settings.HSTS_INCLUDE_SUBDOMAINS,
    hsts_preload=settings.HSTS_PRELOAD,
)
app.middleware("http")(attach_security_context)


@app.middleware("http")
async def request_size_limit_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            request_size = 0
        if request_size > settings.MAX_REQUEST_SIZE_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content=fail(
                    code="request_too_large",
                    message="Request body exceeds the configured maximum size.",
                    details={"max_request_size_bytes": settings.MAX_REQUEST_SIZE_BYTES},
                ).model_dump(mode="json"),
            )
    return await call_next(request)


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
app.include_router(security_tools_router, prefix="/api/security", include_in_schema=False)
app.include_router(log_ws_router)
app.include_router(notification_ws_router)


class SecurityRequest(BaseModel):
    prompt: str
    image_data: str | None = None
    session_id: str | None = None
    request_id: str | None = None
    context: dict[str, object] | None = None


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Sentinel backend is running."}


@app.post("/analyze", include_in_schema=False)
@app.post("/api/v1/analyze")
async def analyze(payload: SecurityRequest) -> dict[str, object]:
    request_context = dict(payload.context or {})
    if payload.session_id:
        request_context["session_id"] = payload.session_id
    if payload.request_id:
        request_context["request_id"] = payload.request_id
    scan_result = scan_prompt(
        payload.prompt,
        provider="gemini",
        model="gemini-1.5-flash",
        security_tier="PRO",
        enforcement_input=SecurityEnforcementInput(
            prompt=payload.prompt,
            session_id=payload.session_id,
            metadata={"context": request_context, "request_id": payload.request_id} if request_context or payload.request_id else None,
        ),
    )
    verdict = dict(scan_result.get("sentinel_verdict") or {})
    if verdict.get("execution_output") != "BLOCKED":
        protected_result = process_sentinel_request(
            payload.prompt,
            context=request_context,
            llm_callable=get_clean_execution_output,
        )
        if protected_result.get("verdict") == "block":
            verdict["execution_output"] = "BLOCKED"
            verdict["category"] = "Policy Violation"
            verdict["detail"] = protected_result.get("response")
        elif protected_result.get("response"):
            assessment = ThreatDetectionService().analyze(
                payload.prompt,
                provider="gemini",
                model="gemini-1.5-flash",
                security_tier="PRO",
            )
            verdict = build_sentinel_verdict(
                assessment,
                execution_output=str(protected_result.get("response") or ""),
                provider="gemini",
                model="gemini-1.5-flash",
                security_tier="PRO",
            )
        verdict["protected_flow"] = {
            "verdict": protected_result.get("verdict"),
            "risk_score": protected_result.get("risk_score"),
            "risk_level": protected_result.get("risk_level"),
            "context_analysis": protected_result.get("context_analysis"),
            "anonymization": protected_result.get("anonymization"),
            "prompt_scan": protected_result.get("prompt_scan"),
            "logic_check": protected_result.get("logic_check"),
        }
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
    security_state = "ok"

    try:
        await ping_mongo()
    except Exception as exc:
        database_state = "unavailable"
        database_error = str(exc)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    if getattr(app.state, "security_startup_error", None):
        security_state = "degraded"

    overall_status = "ok" if database_state == "ok" and security_state == "ok" else "degraded"
    if overall_status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": overall_status,
        "database": database_state,
        "database_name": get_mongo_db_name(),
        "database_error": _summarize_dependency_error(database_error or mongo_status.get("last_error")),
        "security": security_state,
        "mongo_ready": bool(mongo_status.get("ready")),
        "mongo_last_checked_at": mongo_status.get("last_checked_at"),
        "mongo_last_connected_at": mongo_status.get("last_connected_at"),
        "smtp_configured": _smtp_is_configured(),
        "smtp_verify_on_startup": settings.SMTP_VERIFY_ON_STARTUP,
        "smtp_startup_error": getattr(app.state, "smtp_startup_error", None),
        "mongo_startup_error": _summarize_dependency_error(getattr(app.state, "mongo_startup_error", None)),
        "security_startup_error": getattr(app.state, "security_startup_error", None),
        "security_startup_status": getattr(app.state, "security_startup_status", None),
    }