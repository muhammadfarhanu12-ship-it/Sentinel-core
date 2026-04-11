import logging
import time
import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.security_log import LogStatusEnum
from app.services.log_service import LogService

logger = logging.getLogger("logging_middleware")


async def logging_middleware(request: Request, call_next):
    """
    Middleware to log requests and broadcast logs in real time.

    Note: This is safe to keep enabled/disabled depending on deployment needs.
    """
    started_at = time.time()
    request_id = str(uuid.uuid4())
    db: Session = SessionLocal()
    service = LogService(db)

    api_key = getattr(request.state, "api_key", None)
    api_key_id = getattr(api_key, "id", None)
    ip_address = request.client.host if request.client else None

    try:
        response = await call_next(request)
        latency_ms = int((time.time() - started_at) * 1000)
        service.create_log(
            api_key_id=api_key_id,
            status_value=LogStatusEnum.CLEAN,
            endpoint=request.url.path,
            method=request.method,
            ip_address=ip_address,
            latency_ms=latency_ms,
            tokens_used=int(getattr(request.state, "tokens_used", 0) or 0),
            request_id=request_id,
            raw_payload=None,
        )
        return response
    except Exception as exc:
        latency_ms = int((time.time() - started_at) * 1000)
        try:
            service.create_log(
                api_key_id=api_key_id,
                status_value=LogStatusEnum.BLOCKED,
                endpoint=request.url.path,
                method=request.method,
                ip_address=ip_address,
                latency_ms=latency_ms,
                tokens_used=int(getattr(request.state, "tokens_used", 0) or 0),
                request_id=request_id,
                raw_payload={"error": str(exc)},
            )
        except Exception:
            logger.exception("Failed to write security log")
        raise
    finally:
        db.close()
