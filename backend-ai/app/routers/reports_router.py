from __future__ import annotations

import csv
import io
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.api_key import APIKey
from app.models.remediation_log import RemediationLog
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.user import User
from app.schemas.remediation_schema import RemediationLogResponse
from app.schemas.reports_schema import ThreatCountsResponse
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(prefix="/reports", tags=["reports"])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _floor_day(dt: datetime) -> datetime:
    dt = dt.astimezone(timezone.utc)
    return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)


def _floor_week(dt: datetime) -> datetime:
    # Monday-start ISO week.
    dt = dt.astimezone(timezone.utc)
    day_start = _floor_day(dt)
    return day_start - timedelta(days=day_start.weekday())


def _normalize_range(*, start_time: datetime | None, end_time: datetime | None, days: int) -> tuple[datetime, datetime]:
    end = end_time or _utc_now()
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = start_time or (end - timedelta(days=int(days)))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start > end:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="start_time must be <= end_time")
    return start, end


def _threat_counts_series(
    logs: list[SecurityLog],
    *,
    granularity: str,
    start_time: datetime,
    end_time: datetime,
) -> list[dict]:
    if granularity not in ("daily", "weekly"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="granularity must be daily or weekly")

    bucket_fn = _floor_day if granularity == "daily" else _floor_week
    buckets: dict[datetime, dict[str, int]] = defaultdict(lambda: {"blocked": 0, "redacted": 0, "clean": 0, "total": 0})

    for log in logs:
        ts = log.timestamp
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < start_time or ts > end_time:
            continue
        key = bucket_fn(ts)
        buckets[key]["total"] += 1
        if log.status == LogStatusEnum.BLOCKED:
            buckets[key]["blocked"] += 1
        elif log.status == LogStatusEnum.REDACTED:
            buckets[key]["redacted"] += 1
        else:
            buckets[key]["clean"] += 1

    series = [{"period_start": k, **v} for k, v in buckets.items()]
    series.sort(key=lambda row: row["period_start"])
    return series


@router.get("/threat-counts", response_model=ApiResponse[ThreatCountsResponse])
def get_threat_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    granularity: str = Query(default="daily", pattern="^(daily|weekly)$"),
    days: int = Query(default=30, ge=1, le=365),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    start, end = _normalize_range(start_time=start_time, end_time=end_time, days=days)

    logs = (
        db.query(SecurityLog)
        .join(APIKey, SecurityLog.api_key_id == APIKey.id)
        .filter(APIKey.user_id == current_user.id, SecurityLog.timestamp >= start, SecurityLog.timestamp <= end)
        .order_by(SecurityLog.timestamp.asc(), SecurityLog.id.asc())
        .limit(200000)
        .all()
    )

    series = _threat_counts_series(logs, granularity=granularity, start_time=start, end_time=end)
    return ok({"granularity": granularity, "start_time": start, "end_time": end, "series": series})


@router.get("/remediations", response_model=ApiResponse[list[RemediationLogResponse]])
def list_remediation_actions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=1000000),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    start, end = _normalize_range(start_time=start_time, end_time=end_time, days=3650)
    return ok((
        db.query(RemediationLog)
        .filter(RemediationLog.user_id == current_user.id, RemediationLog.created_at >= start, RemediationLog.created_at <= end)
        .order_by(RemediationLog.created_at.desc(), RemediationLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    ))


@router.get("/threat-counts/export")
def export_threat_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    granularity: str = Query(default="daily", pattern="^(daily|weekly)$"),
    days: int = Query(default=30, ge=1, le=365),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    start, end = _normalize_range(start_time=start_time, end_time=end_time, days=days)

    logs = (
        db.query(SecurityLog)
        .join(APIKey, SecurityLog.api_key_id == APIKey.id)
        .filter(APIKey.user_id == current_user.id, SecurityLog.timestamp >= start, SecurityLog.timestamp <= end)
        .order_by(SecurityLog.timestamp.asc(), SecurityLog.id.asc())
        .limit(200000)
        .all()
    )

    series = _threat_counts_series(logs, granularity=granularity, start_time=start, end_time=end)
    data = {"granularity": granularity, "start_time": start, "end_time": end, "series": series}
    if format == "json":
        return data

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["period_start", "blocked", "redacted", "clean", "total"])
    writer.writeheader()
    for row in series:
        writer.writerow(
            {
                "period_start": row["period_start"].isoformat(),
                "blocked": row["blocked"],
                "redacted": row["redacted"],
                "clean": row["clean"],
                "total": row["total"],
            }
        )
    content = buf.getvalue()
    filename = f"sentinel_threat_counts_{granularity}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/remediations/export")
def export_remediations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    limit: int = Query(default=1000, ge=1, le=5000),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    start, end = _normalize_range(start_time=start_time, end_time=end_time, days=3650)
    rows = (
        db.query(RemediationLog)
        .filter(RemediationLog.user_id == current_user.id, RemediationLog.created_at >= start, RemediationLog.created_at <= end)
        .order_by(RemediationLog.created_at.desc(), RemediationLog.id.desc())
        .limit(limit)
        .all()
    )

    if format == "json":
        return rows

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=[
            "id",
            "created_at",
            "user_id",
            "api_key_id",
            "security_log_id",
            "request_id",
            "threat_type",
            "threat_score",
            "actions",
            "email_to",
            "webhook_urls",
            "error",
        ],
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "user_id": r.user_id,
                "api_key_id": r.api_key_id,
                "security_log_id": r.security_log_id,
                "request_id": r.request_id,
                "threat_type": r.threat_type,
                "threat_score": r.threat_score,
                "actions": json.dumps(r.actions or [], ensure_ascii=False),
                "email_to": r.email_to,
                "webhook_urls": json.dumps(r.webhook_urls or [], ensure_ascii=False),
                "error": r.error,
            }
        )
    content = buf.getvalue()
    filename = "sentinel_remediation_actions.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
