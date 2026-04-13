from fastapi import APIRouter, Depends, Query, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import list_audit_logs, parse_optional_datetime

router = APIRouter(tags=["audit-logs"])


@router.get("")
async def read_audit_logs(
    request: Request,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=12, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    severity: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    return ok(
        await list_audit_logs(
            request,
            current_user,
            limit=limit,
            offset=offset,
            severity=severity,
            start_date=parse_optional_datetime(start_date),
            end_date=parse_optional_datetime(end_date),
        )
    )
