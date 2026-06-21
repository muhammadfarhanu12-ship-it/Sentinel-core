from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.testclient import TestClient

from app.admin.admin_model import Admin
from app.admin.admin_schema import (
    AdminApiKeyResponse,
    AdminMetricsResponse,
    AdminSecurityLogResponse,
    AdminSettingsResponse,
    AdminSystemStatusResponse,
    AdminTokenResponse,
    AdminUserSummary,
)
from app.core.config import settings
from app.main import app
import app.main as main_module
from app.middleware import auth_middleware
from app.models.admin_audit_log import AdminAuditLog
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.billing import BillingInvoice, BillingSubscription
from app.models.notification import Notification
from app.models.remediation_log import RemediationLog
from app.models.scan import ScanJob
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.settings import UserSettings
from app.models.usage import Usage
from app.models.user import TierEnum, User, UserRoleEnum
from app.routes import admin as admin_routes
from app.admin import admin_router as admin_v1_router
from app.dependencies import auth as dependency_auth
from app.utils.api_key_generator import generate_api_key
from app.utils.hashing import get_password_hash, verify_password
from app.utils.token_generator import create_access_token
from app.middleware.auth_middleware import decode_token

oauth2_test_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class FieldRef:
    def __init__(self, name: str):
        self.name = name

    def __eq__(self, other: object):
        return ("eq", self.name, other)

    def asc(self):
        return ("asc", self.name)

    def desc(self):
        return ("desc", self.name)


class FakeQuery:
    def __init__(self, session: "FakeSession", model: type[Any], rows: list[Any] | None = None):
        self.session = session
        self.model = model
        self.rows = list(session.storage.get(model, []) if rows is None else rows)

    def filter(self, condition: Any):
        if isinstance(condition, tuple) and len(condition) == 3 and condition[0] == "eq":
            _, field, expected = condition
            self.rows = [row for row in self.rows if getattr(row, str(field), None) == expected]
        return self

    def order_by(self, *_args: Any):
        return self

    def all(self):
        return list(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None

    def count(self):
        return len(self.rows)


class FakeSession:
    def __init__(self):
        self.storage: dict[type[Any], list[Any]] = {}
        self._next_id = 1

    def _ensure_id(self, row: Any) -> None:
        current = getattr(row, "id", None)
        if current is None or isinstance(current, str):
            try:
                setattr(row, "id", self._next_id)
            except Exception:
                pass
            self._next_id += 1

    def add(self, row: Any) -> None:
        self._ensure_id(row)
        rows = self.storage.setdefault(type(row), [])
        if row not in rows:
            rows.append(row)

    def add_all(self, rows: list[Any]) -> None:
        for row in rows:
            self.add(row)

    def delete(self, row: Any) -> None:
        rows = self.storage.get(type(row), [])
        if row in rows:
            rows.remove(row)

    def query(self, model: type[Any]) -> FakeQuery:
        return FakeQuery(self, model)

    def commit(self) -> None:
        return None

    def refresh(self, row: Any) -> None:
        self._ensure_id(row)


class LegacyAdminService:
    def __init__(self, db: FakeSession):
        self.db = db

    def ensure_default_admin(self):
        email = str(settings.ADMIN_BOOTSTRAP_EMAIL or "admin@example.com").lower()
        password = str(settings.ADMIN_BOOTSTRAP_PASSWORD or "AdminPass123")
        existing_admin = self.db.query(Admin).filter(Admin.email == email).first()
        if existing_admin is None:
            existing_admin = Admin(email=email, hashed_password=get_password_hash(password), role="admin", is_active=True)
            self.db.add(existing_admin)
        existing = self.db.query(User).filter(User.email == email).first()
        if existing is None:
            existing = User(
                email=email,
                hashed_password=get_password_hash(password),
                role=UserRoleEnum.SUPER_ADMIN,
                tier=TierEnum.BUSINESS,
                organization_name="sentinel.local",
                is_active=True,
                is_verified=True,
            )
            self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing_admin)
        self.db.refresh(existing)
        return existing_admin

    async def login(self, email: str, password: str, request: Any) -> AdminTokenResponse:
        _ = request
        admin = self.db.query(User).filter(User.email == email.strip().lower()).first()
        if admin is None or not verify_password(password, admin.hashed_password):
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        return AdminTokenResponse(
            access_token=create_access_token({"sub": admin.email, "user_id": str(admin.id), "role": "admin"}),
            role="admin",
        )

    async def get_dashboard(self, admin: dict[str, Any]) -> dict[str, Any]:
        return {"message": "Welcome Admin", "admin": admin}

    async def get_metrics(self, admin: dict[str, Any]) -> AdminMetricsResponse:
        _ = admin
        logs = self.db.query(SecurityLog).all()
        users = self.db.query(User).all()
        keys = self.db.query(APIKey).all()
        return AdminMetricsResponse(
            total_users=len(users),
            active_users=sum(1 for user in users if user.is_active),
            suspended_users=sum(1 for user in users if not user.is_active),
            total_requests=len(logs),
            threats_blocked=sum(1 for row in logs if row.status in {LogStatusEnum.BLOCKED, LogStatusEnum.REDACTED}),
            active_api_keys=sum(1 for key in keys if key.status == KeyStatusEnum.ACTIVE),
            quarantined_api_keys=sum(1 for key in keys if key.status == KeyStatusEnum.QUARANTINED),
            avg_latency_ms=0.0,
            requests_last_7_days=[],
            threat_activity_feed=[],
            policy_trigger_counts={},
            attack_severity_chart=[],
            tool_interception_metrics={},
            leak_prevention_metrics={},
            top_attack_signatures=[],
            user_risk_heatmap=[],
        )

    async def get_system_status(self, admin: dict[str, Any]) -> AdminSystemStatusResponse:
        _ = admin
        return AdminSystemStatusResponse(status="ok", database="ok", uptime_hint="Test", admin_count=1)

    async def list_users(self, admin: dict[str, Any], limit: int, offset: int, q: str | None, is_active=None, tier=None):
        _ = admin, q, is_active, tier
        rows = self.db.query(User).all()[offset: offset + limit]
        return [
            AdminUserSummary(
                id=str(user.id),
                email=user.email,
                tier=str(user.tier.value if hasattr(user.tier, "value") else user.tier),
                organization_name=user.organization_name,
                is_active=user.is_active,
                monthly_limit=user.monthly_limit,
                created_at=user.created_at,
                api_usage=0,
                api_key_count=sum(1 for key in self.db.query(APIKey).all() if key.user_id == user.id),
            )
            for user in rows
        ]

    async def list_logs(self, admin: dict[str, Any], limit: int, offset: int, q: str | None, status=None, risk_level=None, threat_type=None, only_quarantined=None):
        _ = admin, q, status, risk_level, threat_type, only_quarantined
        rows = self.db.query(SecurityLog).all()[offset: offset + limit]
        users = {user.id: user for user in self.db.query(User).all()}
        keys = {key.id: key for key in self.db.query(APIKey).all()}
        payload = []
        for row in rows:
            user = users.get(getattr(keys.get(row.api_key_id), "user_id", None))
            payload.append(
                AdminSecurityLogResponse(
                    id=str(row.id),
                    timestamp=row.timestamp,
                    api_key_id=str(row.api_key_id) if row.api_key_id is not None else None,
                    user_id=str(getattr(user, "id", "")) if user else None,
                    user_email=getattr(user, "email", None),
                    status=str(row.status.value if hasattr(row.status, "value") else row.status).upper(),
                    threat_type=row.threat_type,
                    threat_types=row.threat_types,
                    threat_score=row.threat_score,
                    risk_score=row.risk_score,
                    attack_vector=row.attack_vector,
                    risk_level=row.risk_level,
                    endpoint=row.endpoint,
                    method=row.method,
                    model=row.model,
                    latency_ms=row.latency_ms,
                    tokens_used=row.tokens_used,
                    ip_address=row.ip_address,
                    is_quarantined=row.is_quarantined,
                    raw_payload=row.raw_payload,
                )
            )
        return payload

    async def list_threats(self, *args: Any, **kwargs: Any):
        return await self.list_logs(*args, **kwargs)

    async def list_api_keys(self, admin: dict[str, Any], limit: int, offset: int, q: str | None, status=None):
        _ = admin, q, status
        users = {user.id: user for user in self.db.query(User).all()}
        return [
            AdminApiKeyResponse(
                id=str(key.id),
                user_id=str(key.user_id),
                user_email=getattr(users.get(key.user_id), "email", "unknown@example.com"),
                name=key.name,
                prefix=key.prefix,
                status=str(key.status.value if hasattr(key.status, "value") else key.status).upper(),
                usage_count=key.usage_count,
                last_used=key.last_used,
                last_ip=key.last_ip,
                created_at=key.created_at,
                key=None,
            )
            for key in self.db.query(APIKey).all()[offset: offset + limit]
        ]

    async def create_gateway_api_key(self, admin: dict[str, Any], payload: Any, request: Any | None = None):
        _ = admin
        user = self.db.query(User).filter(User.id == payload.user_id).first()
        raw_key = generate_api_key()
        key = APIKey(user_id=user.id if user else payload.user_id, name=payload.name, prefix=raw_key[:16], key_hash=get_password_hash(raw_key))
        self.db.add(key)
        self.db.commit()
        return AdminApiKeyResponse(
            id=str(key.id),
            user_id=str(key.user_id),
            user_email=getattr(user, "email", "unknown@example.com"),
            name=key.name,
            prefix=key.prefix,
            status="ACTIVE",
            usage_count=0,
            created_at=key.created_at,
            key=raw_key,
        )

    async def revoke_gateway_api_key(self, admin: dict[str, Any], key_id: str, request: Any | None = None):
        _ = admin
        key = self.db.query(APIKey).filter(APIKey.id == int(key_id)).first()
        if key:
            key.status = KeyStatusEnum.REVOKED
        users = {user.id: user for user in self.db.query(User).all()}
        return AdminApiKeyResponse(
            id=str(getattr(key, "id", key_id)),
            user_id=str(getattr(key, "user_id", "")),
            user_email=getattr(users.get(getattr(key, "user_id", None)), "email", "unknown@example.com"),
            name=getattr(key, "name", "API Key"),
            prefix=getattr(key, "prefix", None),
            status="REVOKED",
            usage_count=getattr(key, "usage_count", 0),
            created_at=getattr(key, "created_at", datetime.now(timezone.utc)),
            key=None,
        )

    async def delete_user(self, admin: dict[str, Any], user_id: str, request: Any | None = None):
        _ = admin
        user = self.db.query(User).filter(User.id == int(user_id)).first()
        if user:
            self.db.delete(user)
        self.db.add(AdminAuditLog(actor_id="admin", action="admin.users.delete", target_type="user", target_id=user_id))
        self.db.commit()
        return {"deleted": True, "user_id": user_id}

    async def update_user_status(self, admin: dict[str, Any], user_id: str, payload: Any, request: Any | None = None):
        _ = admin
        user = self.db.query(User).filter(User.id == int(user_id)).first()
        if user:
            user.is_active = bool(payload.is_active)
        return (await self.list_users({}, 200, 0, None))[0 if user is None else self.db.query(User).all().index(user)]

    async def get_settings(self, admin: dict[str, Any]) -> AdminSettingsResponse:
        _ = admin
        return AdminSettingsResponse(
            enable_gemini_module=True,
            enable_openai_module=True,
            enable_anthropic_module=False,
            ai_kill_switch_enabled=False,
            require_mfa_for_admin=False,
            admin_rate_limit_per_minute=120,
            admin_rate_limit_window_seconds=60,
            api_key_rate_limit_per_minute=600,
            updated_at=datetime.now(timezone.utc),
        )

    async def update_settings(self, admin: dict[str, Any], payload: Any, request: Any | None = None) -> AdminSettingsResponse:
        _ = admin
        return AdminSettingsResponse(**payload.model_dump(), updated_at=datetime.now(timezone.utc))

    async def list_audit_events(self, admin: dict[str, Any], limit: int, offset: int, q: str | None, severity: str | None, start_date: Any, end_date: Any):
        _ = admin, q, severity, start_date, end_date
        rows = [
            {
                "id": f"audit-{log.id}",
                "timestamp": log.timestamp.isoformat(),
                "actor": "admin@example.com",
                "actor_type": "ADMIN",
                "action": "security_event",
                "event_type": "security_event",
                "resource": log.threat_type or "security_log",
                "severity": "CRITICAL" if log.status == LogStatusEnum.BLOCKED else "INFO",
                "request_id": None,
                "decision": str(log.status.value if hasattr(log.status, "value") else log.status).upper(),
                "risk_score": float(log.risk_score or 0.0),
                "matched_policies": [],
                "provider": None,
                "model": log.model,
                "prompt_preview": None,
                "metadata": {},
                "old_value": None,
                "new_value": None,
            }
            for log in self.db.query(SecurityLog).all()[offset: offset + limit]
        ]
        return rows

    async def get_report_summary(self, admin: dict[str, Any]) -> dict[str, Any]:
        _ = admin
        return {
            "summary": {
                "blocked_attacks": 1,
                "prompt_injection_attempts": 1,
                "high_risk_financial_operations": 0,
                "suspicious_tool_calls": 0,
                "pii_exposure_attempts": 0,
                "usage_spikes": 0,
                "policy_violations": 1,
                "provider_failures": 0,
                "model_denied_events": 0,
                "quota_exceeded_events": 0,
            },
            "recent_alerts": [],
            "realtime_limitations": {
                "streaming_alert_bus": False,
                "note": "Test summary",
            },
        }


def _install_field_refs() -> None:
    for model in (User, Admin, APIKey, SecurityLog, RemediationLog, Usage, ScanJob, Notification, BillingSubscription, BillingInvoice, UserSettings, AdminAuditLog):
        for field_name in getattr(model, "model_fields", {}).keys():
            setattr(model, field_name, FieldRef(field_name))


@pytest.fixture
def db_session(monkeypatch: pytest.MonkeyPatch) -> FakeSession:
    _install_field_refs()
    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_EMAIL", "admin@example.com", raising=False)
    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_PASSWORD", "AdminPass123", raising=False)
    session = FakeSession()
    monkeypatch.setattr("app.admin.admin_service.AdminService.ensure_default_admin", lambda self: LegacyAdminService(session).ensure_default_admin(), raising=False)
    return session


@pytest.fixture
def client(db_session: FakeSession, monkeypatch: pytest.MonkeyPatch):
    admin_user = LegacyAdminService(db_session).ensure_default_admin()
    current_user = {
        "_id": str(admin_user.id),
        "id": str(admin_user.id),
        "email": admin_user.email,
        "name": "Test Admin",
        "tier": "BUSINESS",
        "role": "admin",
        "organization_name": "sentinel.local",
        "is_active": True,
        "is_verified": True,
        "monthly_limit": 100000,
        "created_at": admin_user.created_at,
        "updated_at": admin_user.updated_at,
        "is_admin": True,
    }

    async def noop_connect_to_mongo(*args: Any, **kwargs: Any):
        app.state.mongodb_client = None
        app.state.database = None

    async def noop_close_mongo_connection(*args: Any, **kwargs: Any):
        return None

    async def ok_ping_mongo():
        return None

    async def noop_bootstrap_admin_system():
        return None

    monkeypatch.setattr(main_module, "connect_to_mongo", noop_connect_to_mongo)
    monkeypatch.setattr(main_module, "close_mongo_connection", noop_close_mongo_connection)
    monkeypatch.setattr(main_module, "ping_mongo", ok_ping_mongo)
    monkeypatch.setattr(main_module, "bootstrap_admin_system", noop_bootstrap_admin_system)

    async def override_user():
        return current_user

    async def override_admin(token: str | None = Depends(oauth2_test_scheme)):
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        try:
            token_data = decode_token(token, expected_type="access")
        except HTTPException as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials") from exc
        role = str((token_data.claims or {}).get("role") or "").lower()
        if role != "admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin access required")
        return current_user

    def override_service():
        return LegacyAdminService(db_session)

    app.dependency_overrides[auth_middleware.get_current_user] = override_user
    app.dependency_overrides[auth_middleware.get_current_admin] = override_admin
    app.dependency_overrides[dependency_auth.get_admin_user] = override_admin
    app.dependency_overrides[admin_routes.get_admin_service] = override_service
    app.dependency_overrides[admin_v1_router.get_admin_service] = override_service

    from app.routers import reports_router
    from app.routers import audit_logs_router, usage_router, team_router

    async def fake_threat_counts(request: Any, current_user_arg: dict, **kwargs: Any):
        _ = request, current_user_arg, kwargs
        logs = db_session.query(SecurityLog).all()
        return {
            "granularity": kwargs.get("granularity", "daily"),
            "series": [
                {
                    "period_start": datetime.now(timezone.utc).date().isoformat(),
                    "blocked": sum(1 for row in logs if row.status == LogStatusEnum.BLOCKED),
                    "redacted": sum(1 for row in logs if row.status == LogStatusEnum.REDACTED),
                    "clean": sum(1 for row in logs if row.status == LogStatusEnum.CLEAN),
                    "total": len(logs),
                }
            ],
        }

    async def fake_remediations(request: Any, current_user_arg: dict, limit: int = 50, offset: int = 0):
        _ = request, current_user_arg
        rows = db_session.query(RemediationLog).all()[offset: offset + limit]
        return [row.model_dump(mode="json") for row in rows]

    monkeypatch.setattr(reports_router, "get_threat_counts", fake_threat_counts)
    monkeypatch.setattr(reports_router, "list_remediations", fake_remediations)

    async def fake_audit_logs(request: Any, current_user_arg: dict, limit: int = 12, offset: int = 0, **kwargs: Any):
        _ = request, current_user_arg
        q = str(kwargs.get("q") or "").strip().lower()
        logs = db_session.query(SecurityLog).all()
        remediations = db_session.query(RemediationLog).all()
        rows = [
            {
                "id": f"log-{row.id}",
                "timestamp": row.timestamp.isoformat(),
                "actor": current_user["email"],
                "actor_type": "USER",
                "action": "SECURITY_EVENT",
                "resource": row.threat_type or "security_log",
                "severity": "CRITICAL" if row.status == LogStatusEnum.BLOCKED else "INFO",
                "request_id": getattr(row, "request_id", None),
                "decision": str(row.status.value if hasattr(row.status, "value") else row.status).upper(),
                "risk_score": float(row.risk_score or 0.0) * 100,
                "model": getattr(row, "model", None),
            }
            for row in logs
        ]
        rows.extend(
            {
                "id": f"remediation-{row.id}",
                "timestamp": row.created_at.isoformat(),
                "actor": current_user["email"],
                "actor_type": "SYSTEM",
                "action": "REMEDIATION_EXECUTED",
                "resource": row.threat_type or "remediation",
                "severity": "CRITICAL",
                "request_id": getattr(row, "request_id", None),
                "decision": "SUCCESS",
                "risk_score": float(row.threat_score or 0.0) * 100,
            }
            for row in remediations
        )
        if q:
            rows = [row for row in rows if q in str(row).lower()]
        return rows[offset: offset + limit]

    async def fake_usage_summary(request: Any, current_user_arg: dict):
        _ = request, current_user_arg
        logs = db_session.query(SecurityLog).all()
        return {
            "total_requests": len(logs),
            "blocked_injections": sum(1 for row in logs if row.status == LogStatusEnum.BLOCKED),
            "tokens_used": sum(int(row.tokens_used or 0) for row in logs),
            "trend": [{"date": f"day-{index + 1}", "requests": 0, "blocked": 0} for index in range(30)],
        }

    async def fake_team_members(request: Any, current_user_arg: dict):
        _ = request, current_user_arg
        return [
            {
                "id": user.id,
                "email": user.email,
                "role": "ADMIN" if str(user.role.value if hasattr(user.role, "value") else user.role) == "admin" else "VIEWER",
                "status": "ACTIVE",
            }
            for user in db_session.query(User).all()
        ]

    monkeypatch.setattr(audit_logs_router, "list_audit_logs", fake_audit_logs)
    monkeypatch.setattr(usage_router, "get_usage_summary", fake_usage_summary)
    monkeypatch.setattr(team_router, "list_team_members", fake_team_members)

    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

    app.dependency_overrides.clear()
