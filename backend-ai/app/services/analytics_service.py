from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.api_key import APIKey
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.user import User


def build_dashboard_analytics(db: Session, user: User):
    key_ids = [row[0] for row in db.query(APIKey.id).filter(APIKey.user_id == user.id).all()]
    if not key_ids:
        return {
            "totalThreatsBlocked": 0,
            "promptInjectionsDetected": 0,
            "dataLeaksPrevented": 0,
            "apiRequestsToday": 0,
            "securityScore": 100,
            "threatsOverTime": [],
            "usageVsLimit": {"used": 0, "limit": user.monthly_limit},
        }

    logs = (
        db.query(SecurityLog)
        .filter(SecurityLog.api_key_id.in_(key_ids))
        .order_by(SecurityLog.timestamp.asc())
        .all()
    )
    return _summarize_logs(logs, user.monthly_limit)


def build_threat_stats(db: Session, user: User):
    analytics = build_dashboard_analytics(db, user)
    return {
        "totalThreatsBlocked": analytics["totalThreatsBlocked"],
        "promptInjectionsDetected": analytics["promptInjectionsDetected"],
        "dataLeaksPrevented": analytics["dataLeaksPrevented"],
        "securityScore": analytics["securityScore"],
    }


def build_usage_summary(db: Session, user: User):
    analytics = build_dashboard_analytics(db, user)
    return analytics["usageVsLimit"]


def _summarize_logs(logs, monthly_limit: int):
    now = datetime.now(timezone.utc)
    today = now.date()
    series_map = defaultdict(lambda: {"clean": 0, "blocked": 0})
    blocked_count = 0
    prompt_injection_count = 0
    data_leak_count = 0
    today_count = 0

    for log in logs:
        timestamp = log.timestamp or now
        key = timestamp.date().isoformat()
        if log.status == LogStatusEnum.CLEAN:
            series_map[key]["clean"] += 1
        else:
            series_map[key]["blocked"] += 1
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
    threats_over_time = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        lookup = day.isoformat()
        threats_over_time.append(
            {
                "date": day.strftime("%b %d"),
                "clean": series_map[lookup]["clean"],
                "blocked": series_map[lookup]["blocked"],
            }
        )

    total_logs = len(logs)
    security_score = 100 if total_logs == 0 else max(0, 100 - int((blocked_count / total_logs) * 100))
    return {
        "totalThreatsBlocked": blocked_count,
        "promptInjectionsDetected": prompt_injection_count,
        "dataLeaksPrevented": data_leak_count,
        "apiRequestsToday": today_count,
        "securityScore": security_score,
        "threatsOverTime": threats_over_time,
        "usageVsLimit": {"used": total_logs, "limit": monthly_limit},
    }
