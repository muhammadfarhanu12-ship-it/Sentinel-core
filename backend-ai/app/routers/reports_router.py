from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import (
    get_threat_counts,
    list_remediations,
    parse_optional_datetime,
    render_remediations_csv,
    render_threat_counts_csv,
)

router = APIRouter(tags=["reports"])


@router.get("/threat-counts")
async def read_threat_counts(
    request: Request,
    current_user: dict = Depends(get_current_user),
    granularity: str = Query(default="daily"),
    days: int = Query(default=30, ge=1, le=365),
    start_time: str | None = None,
    end_time: str | None = None,
):
    payload = await get_threat_counts(
        request,
        current_user,
        granularity=granularity,
        days=days,
        start_time=parse_optional_datetime(start_time),
        end_time=parse_optional_datetime(end_time),
    )
    return ok(payload)


@router.get("/threat-counts/export")
async def export_threat_counts(
    request: Request,
    current_user: dict = Depends(get_current_user),
    granularity: str = Query(default="daily"),
    days: int = Query(default=30, ge=1, le=365),
    start_time: str | None = None,
    end_time: str | None = None,
    format: str = Query(default="json"),
):
    payload = await get_threat_counts(
        request,
        current_user,
        granularity=granularity,
        days=days,
        start_time=parse_optional_datetime(start_time),
        end_time=parse_optional_datetime(end_time),
    )
    if str(format).lower() == "csv":
        return PlainTextResponse(render_threat_counts_csv(payload), media_type="text/csv")
    return JSONResponse(payload)


@router.get("/remediations")
async def read_remediations(
    request: Request,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    return ok(await list_remediations(request, current_user, limit=limit, offset=offset))


@router.get("/remediations/export")
async def export_remediations(
    request: Request,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=5000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    format: str = Query(default="json"),
):
    rows = await list_remediations(request, current_user, limit=limit, offset=offset)
    if str(format).lower() == "csv":
        return PlainTextResponse(render_remediations_csv(rows), media_type="text/csv")
    return JSONResponse(rows)
