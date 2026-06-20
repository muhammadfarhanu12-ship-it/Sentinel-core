from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.threats_service import (
    bulk_update_threats,
    get_threat_distribution,
    get_threat_event,
    get_threat_stats,
    get_threat_trend,
    list_threat_events,
    render_threat_events_csv,
    update_threat_status,
)

router = APIRouter(tags=["threats"])


class ThreatStatusPatch(BaseModel):
    status: str = Field(..., pattern="^(RESOLVED|FALSE_POSITIVE|INVESTIGATING)$")


class ThreatBulkPatch(BaseModel):
    ids: list[str] = Field(default_factory=list)
    action: str = Field(..., pattern="^(acknowledge|resolve)$")


@router.get("/")
@router.get("", include_in_schema=False)
async def read_threats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    severity: str = Query(default="ALL"),
    status: str = Query(default="ALL"),
    type: str = Query(default="ALL"),
    search: str | None = Query(default=None, max_length=200),
    timeRange: str = Query(default="24h"),
    sortField: str = Query(default="ts"),
    sortDir: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=100),
):
    return ok(
        await list_threat_events(
            request,
            current_user,
            severity=severity,
            status=status,
            threat_type=type,
            search=search,
            time_range=timeRange,
            sort_field=sortField,
            sort_dir=sortDir,
            page=page,
            page_size=pageSize,
        )
    )


@router.get("/stats")
async def read_threat_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    timeRange: str = Query(default="24h"),
):
    return ok(await get_threat_stats(request, current_user, time_range=timeRange))


@router.get("/trend")
async def read_threat_trend(
    request: Request,
    current_user: dict = Depends(get_current_user),
    timeRange: str = Query(default="7d"),
    groupBy: str = Query(default="type"),
):
    return ok(await get_threat_trend(request, current_user, time_range=timeRange, group_by=groupBy))


@router.get("/distribution")
async def read_threat_distribution(
    request: Request,
    current_user: dict = Depends(get_current_user),
    timeRange: str = Query(default="30d"),
):
    return ok(await get_threat_distribution(request, current_user, time_range=timeRange))


@router.get("/export")
async def export_threats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    format: str = Query(default="json"),
    severity: str = Query(default="ALL"),
    status: str = Query(default="ALL"),
    type: str = Query(default="ALL"),
    search: str | None = Query(default=None, max_length=200),
    timeRange: str = Query(default="24h"),
    sortField: str = Query(default="ts"),
    sortDir: str = Query(default="desc"),
):
    payload = await list_threat_events(
        request,
        current_user,
        severity=severity,
        status=status,
        threat_type=type,
        search=search,
        time_range=timeRange,
        sort_field=sortField,
        sort_dir=sortDir,
        page=1,
        page_size=5000,
    )
    events = payload["threats"]
    if str(format).lower() == "csv":
        return PlainTextResponse(render_threat_events_csv(events), media_type="text/csv")
    return JSONResponse(events)


@router.patch("/bulk")
async def patch_threats_bulk(
    payload: ThreatBulkPatch,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return ok(await bulk_update_threats(request, current_user, ids=payload.ids, action=payload.action))


@router.get("/{threat_id}")
async def read_threat(
    threat_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return ok(await get_threat_event(request, current_user, threat_id=threat_id))


@router.patch("/{threat_id}/status")
async def patch_threat_status(
    threat_id: str,
    payload: ThreatStatusPatch,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return ok(await update_threat_status(request, current_user, threat_id=threat_id, status=payload.status))
