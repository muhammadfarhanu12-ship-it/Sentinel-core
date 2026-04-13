from fastapi import APIRouter, Depends, Query, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import list_logs, parse_optional_datetime

router = APIRouter(tags=["logs"])


@router.get("")
async def read_logs(
    request: Request,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    status: str | None = None,
    threat_type: str | None = None,
    api_key_id: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    q: str | None = None,
):
    rows = await list_logs(
        request,
        current_user,
        limit=limit,
        offset=offset,
        status=status,
        threat_type=threat_type,
        api_key_id=api_key_id,
        start_time=parse_optional_datetime(start_time),
        end_time=parse_optional_datetime(end_time),
        q=q,
    )
    return ok(rows)
