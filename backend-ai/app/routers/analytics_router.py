from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.api_key import APIKey
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.user import User
from app.schemas.analytics_schema import AnalyticsResponse
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=ApiResponse[AnalyticsResponse])
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_key_ids = [
        row[0] for row in db.query(APIKey.id).filter(APIKey.user_id == current_user.id).all()
    ]

    if not user_key_ids:
        return ok(AnalyticsResponse(
            totalThreatsBlocked=0,
            promptInjectionsDetected=0,
            dataLeaksPrevented=0,
            apiRequestsToday=0,
            securityScore=100,
            threatsOverTime=[],
            usageVsLimit={"used": 0, "limit": current_user.monthly_limit},
        ))

    logs = (
        db.query(SecurityLog)
        .filter(SecurityLog.api_key_id.in_(user_key_ids))
        .order_by(SecurityLog.timestamp.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    today = now.date()
    series_map = defaultdict(lambda: {"clean": 0, "blocked": 0})
    blocked_count = 0
    prompt_injection_count = 0
    data_leak_count = 0
    today_count = 0

    for log in logs:
        timestamp = log.timestamp or now
        day_key = timestamp.date().isoformat()
        if log.status == LogStatusEnum.CLEAN:
            series_map[day_key]["clean"] += 1
        else:
            series_map[day_key]["blocked"] += 1
            blocked_count += 1

        tlist = []
        if getattr(log, "threat_types", None):
            try:
                tlist = [str(t).upper() for t in (log.threat_types or []) if str(t)]
            except Exception:
                tlist = []
        if not tlist:
            tlist = [(log.threat_type or "").upper()] if log.threat_type else []

        if "PROMPT_INJECTION" in tlist:
            prompt_injection_count += 1
        if any(t in {"DATA_LEAK", "PII_EXPOSURE", "DATA_EXFILTRATION"} for t in tlist):
            data_leak_count += 1
        if timestamp.date() == today:
            today_count += 1

    start_date = today - timedelta(days=6)
    points = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        key = day.isoformat()
        points.append(
            {
                "date": day.strftime("%b %d"),
                "clean": series_map[key]["clean"],
                "blocked": series_map[key]["blocked"],
            }
        )

    total_logs = len(logs)
    security_score = 100 if total_logs == 0 else max(0, 100 - int((blocked_count / total_logs) * 100))

    return ok(AnalyticsResponse(
        totalThreatsBlocked=blocked_count,
        promptInjectionsDetected=prompt_injection_count,
        dataLeaksPrevented=data_leak_count,
        apiRequestsToday=today_count,
        securityScore=security_score,
        threatsOverTime=points,
        usageVsLimit={"used": total_logs, "limit": current_user.monthly_limit},
    ))
