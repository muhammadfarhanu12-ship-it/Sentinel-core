from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.brain_schema import (
    BrainAnalyzeRequest,
    BrainAnalyzeResponse,
    BrainInsightsRequest,
    BrainInsightsResponse,
)
from app.services.log_service import LogService


router = APIRouter(prefix="/brain", tags=["brain"])

_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_SECONDS = 60


def _cache_get(key: str) -> Any | None:
    item = _CACHE.get(key)
    if not item:
        return None
    expires_at, value = item
    if time.time() >= expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any, ttl_seconds: int = _CACHE_TTL_SECONDS) -> None:
    _CACHE[key] = (time.time() + ttl_seconds, value)


@router.post("/analyze", response_model=ApiResponse[BrainAnalyzeResponse])
def brain_analyze(
    payload: BrainAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Best-effort caching to reduce repeated analysis load.
    raw = (payload.prompt or "").strip()
    cache_key = f"brain:analyze:{current_user.id}:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()
    cached = _cache_get(cache_key)
    if cached is not None:
        return ok(BrainAnalyzeResponse(status="cached", analysis=cached))

    from app.ai_service import get_security_analysis

    analysis = get_security_analysis(raw, payload.image_data)
    _cache_set(cache_key, analysis)
    return ok(BrainAnalyzeResponse(status="ok", analysis=analysis))


@router.post("/insights", response_model=ApiResponse[BrainInsightsResponse])
def brain_insights(
    payload: BrainInsightsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=int(payload.days))
    logs = LogService(db).get_user_logs(
        current_user.id,
        limit=500,
        offset=0,
        start_time=start,
        end_time=now,
    )

    threat_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for log in logs:
        types = []
        if getattr(log, "threat_types", None):
            try:
                types = [str(t).upper() for t in (log.threat_types or []) if str(t)]
            except Exception:
                types = []
        if not types:
            types = [(getattr(log, "threat_type", None) or "NONE").upper()]
        s = str(getattr(log, "status", "UNKNOWN"))
        for t in types:
            threat_counts[t] = threat_counts.get(t, 0) + 1
        status_counts[s] = status_counts.get(s, 0) + 1

    top_threat = max(threat_counts.items(), key=lambda kv: kv[1])[0] if threat_counts else "NONE"
    summary = f"Last {payload.days} days: {len(logs)} events; top threat={top_threat}."
    return ok(
        BrainInsightsResponse(
            summary=summary,
            insights={
                "window": {"start": start.isoformat(), "end": now.isoformat(), "days": payload.days},
                "status_counts": status_counts,
                "threat_counts": threat_counts,
                "recommendations": [
                    "Review blocked/redacted events and rotate/quarantine affected API keys.",
                    "Tighten `alert_threshold` and enable automated remediation if disabled.",
                    "Add allowlists/guardrails for high-risk endpoints and models.",
                ],
            },
        )
    )
