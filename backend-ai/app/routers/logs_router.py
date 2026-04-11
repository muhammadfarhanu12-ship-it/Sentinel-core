from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.middleware.auth_middleware import get_current_user
from app.schemas.logs_schema import SecurityLogResponse
from app.schemas.api_schema import ApiResponse, ok
from app.models.security_log import LogStatusEnum
from app.services.log_forensics import build_forensics_prompt
from app.services.log_service import LogService

router = APIRouter(prefix="/logs", tags=["logs"])

@router.get("", response_model=ApiResponse[List[SecurityLogResponse]])
def get_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0, le=1000000),
    status_filter: LogStatusEnum | None = Query(default=None, alias="status"),
    threat_type: str | None = Query(default=None, max_length=64),
    api_key_id: int | None = Query(default=None, ge=1),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
):
    if start_time and end_time and start_time > end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_time must be <= end_time",
        )

    service = LogService(db)
    return ok(service.get_user_logs(
        current_user.id,
        limit=limit,
        offset=offset,
        status_filter=status_filter,
        threat_type=threat_type,
        api_key_id=api_key_id,
        start_time=start_time,
        end_time=end_time,
        query=q,
    ))


@router.get("/forensics/prompt", response_model=ApiResponse[dict])
def get_forensics_prompt(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=500, ge=1, le=1000),
    status_filter: LogStatusEnum | None = Query(default=None, alias="status"),
    threat_type: str | None = Query(default=None, max_length=64),
    api_key_id: int | None = Query(default=None, ge=1),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    """
    Builds a Gemini 3.1 Pro log-forensics prompt using summarized logs.

    This endpoint intentionally does NOT return raw large logs. It returns:
    - compact summaries
    - a ready-to-send forensic prompt
    - chunking guidance
    """
    if start_time and end_time and start_time > end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_time must be <= end_time",
        )

    logs = LogService(db).get_user_logs(
        current_user.id,
        limit=limit,
        offset=0,
        status_filter=status_filter,
        threat_type=threat_type,
        api_key_id=api_key_id,
        start_time=start_time,
        end_time=end_time,
        query=None,
    )
    return ok(build_forensics_prompt(logs))
