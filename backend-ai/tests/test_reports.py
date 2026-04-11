from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.remediation_log import RemediationLog
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.user import User
from app.utils.hashing import get_password_hash


def _ensure_demo_user_and_key(db):
    user = db.query(User).filter(User.email == settings.DEMO_USER_EMAIL).first()
    if not user:
        user = User(email=settings.DEMO_USER_EMAIL, hashed_password=get_password_hash("demo"), is_verified=True)
        db.add(user)
        db.commit()
        db.refresh(user)

    key = db.query(APIKey).filter(APIKey.user_id == user.id).first()
    if not key:
        key = APIKey(
            user_id=user.id,
            prefix="sentinel_sk_",
            key_hash=get_password_hash(settings.TEST_API_KEY),
            name="Demo",
            status=KeyStatusEnum.ACTIVE,
        )
        db.add(key)
        db.commit()
        db.refresh(key)
    return user, key


def test_reports_threat_counts_and_exports(client, db_session):
    user, key = _ensure_demo_user_and_key(db_session)
    now = datetime.now(timezone.utc)

    logs = [
        SecurityLog(api_key_id=key.id, timestamp=now - timedelta(days=2), status=LogStatusEnum.BLOCKED, threat_type="PROMPT_INJECTION", threat_score=0.99),
        SecurityLog(api_key_id=key.id, timestamp=now - timedelta(days=2), status=LogStatusEnum.REDACTED, threat_type="DATA_LEAK", threat_score=0.65),
        SecurityLog(api_key_id=key.id, timestamp=now - timedelta(days=1), status=LogStatusEnum.CLEAN, threat_type="NONE", threat_score=0.1),
    ]
    db_session.add_all(logs)
    db_session.commit()

    res = client.get("/api/v1/reports/threat-counts?granularity=daily&days=7")
    assert res.status_code == 200
    wrapped = res.json()
    assert wrapped["success"] is True
    body = wrapped["data"]
    assert body["granularity"] == "daily"
    assert isinstance(body.get("series"), list)
    assert sum(int(p.get("total", 0)) for p in body["series"]) == 3

    csv_res = client.get("/api/v1/reports/threat-counts/export?granularity=daily&days=7&format=csv")
    assert csv_res.status_code == 200
    assert "text/csv" in (csv_res.headers.get("content-type") or "")
    assert csv_res.text.splitlines()[0].startswith("period_start,blocked,redacted,clean,total")

    json_res = client.get("/api/v1/reports/threat-counts/export?granularity=daily&days=7&format=json")
    assert json_res.status_code == 200
    assert json_res.json()["granularity"] == "daily"


def test_reports_remediations_and_exports(client, db_session):
    user, key = _ensure_demo_user_and_key(db_session)
    now = datetime.now(timezone.utc)

    r = RemediationLog(
        user_id=user.id,
        api_key_id=key.id,
        security_log_id=None,
        request_id="req_123",
        threat_type="PROMPT_INJECTION",
        threat_score=0.99,
        actions=[
            {"type": "QUARANTINE_API_KEY", "status": "SUCCESS"},
            {"type": "ALERT_EMAIL", "status": "SUCCESS"},
        ],
        email_to="secops@example.com",
        webhook_urls=["https://example.test/webhook"],
        error=None,
        created_at=now,
    )
    db_session.add(r)
    db_session.commit()

    res = client.get("/api/v1/reports/remediations?limit=50&offset=0")
    assert res.status_code == 200
    wrapped = res.json()
    assert wrapped["success"] is True
    rows = wrapped["data"]
    assert isinstance(rows, list)
    assert len(rows) >= 1
    assert rows[0]["request_id"] == "req_123"

    csv_res = client.get("/api/v1/reports/remediations/export?format=csv&limit=1000")
    assert csv_res.status_code == 200
    assert "text/csv" in (csv_res.headers.get("content-type") or "")
    assert csv_res.text.splitlines()[0].startswith("id,created_at,user_id,api_key_id,security_log_id,request_id,threat_type,threat_score,actions,email_to,webhook_urls,error")

    json_res = client.get("/api/v1/reports/remediations/export?format=json&limit=1000")
    assert json_res.status_code == 200
    assert isinstance(json_res.json(), list)
