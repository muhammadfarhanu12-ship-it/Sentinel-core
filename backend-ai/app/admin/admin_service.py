from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import case, desc, func, or_, text
from sqlalchemy.orm import Session

from app.admin.admin_access_request_model import AdminAccessRequest
from app.admin.admin_auth import create_admin_access_token
from app.admin.admin_model import Admin
from app.core.config import settings
from app.admin.admin_schema import (
    AdminAccessRequestCreate,
    AdminAccessRequestResponse,
    AdminApiKeyCreateRequest,
    AdminApiKeyResponse,
    AdminForgotPasswordResponse,
    AdminMessageResponse,
    AdminMetricsResponse,
    AdminMetricsSeriesPoint,
    AdminResetPasswordRequest,
    AdminSecurityLogResponse,
    AdminSettingsResponse,
    AdminSettingsUpdateRequest,
    AdminSystemStatusResponse,
    AdminTokenResponse,
    AdminUserStatusUpdate,
    AdminUserSummary,
)
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_settings import AdminPlatformSettings
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.usage import Usage
from app.models.user import User
from app.middleware.rate_limiter import check_rate_limit
from app.schemas.api_key_schema import APIKeyCreate
from app.services.api_key_service import create_api_key, revoke_api_key
from app.services.audit_service import audit_event
from app.utils.hashing import get_password_hash, verify_password

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = "admin@example.com"
ADMIN_ROLE = "admin"


class AdminService:
    def __init__(self, db: Session):
        self.db = db

    def ensure_default_admin(
        self,
        email: str | None = None,
        password: str | None = None,
        *,
        sync_password: bool = False,
    ) -> Admin | None:
        resolved_email = str(email or settings.ADMIN_BOOTSTRAP_EMAIL or DEFAULT_ADMIN_EMAIL).strip().lower()
        resolved_password = str(password or settings.ADMIN_BOOTSTRAP_PASSWORD or "").strip()
        if not resolved_password:
            logger.info("Admin bootstrap skipped because ADMIN_BOOTSTRAP_PASSWORD is not configured")
            return None

        normalized_email = resolved_email
        admin = self.db.query(Admin).filter(func.lower(Admin.email) == normalized_email).first()
        if admin:
            changed = False
            if admin.email != normalized_email:
                admin.email = normalized_email
                changed = True
            if str(admin.role or "").strip().lower() != ADMIN_ROLE:
                admin.role = ADMIN_ROLE
                changed = True
            if not admin.is_active:
                admin.is_active = True
                changed = True
            if sync_password and not verify_password(resolved_password, admin.hashed_password):
                admin.hashed_password = get_password_hash(resolved_password)
                changed = True

            if changed:
                self.db.add(admin)
                self.db.commit()
                self.db.refresh(admin)
                audit_event("admin.seed.updated", outcome="success", actor_id=admin.id, target=admin.email)
            return admin

        admin = Admin(
            email=normalized_email,
            hashed_password=get_password_hash(resolved_password),
            role=ADMIN_ROLE,
            is_active=True,
        )
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        audit_event("admin.seed.created", outcome="success", actor_id=admin.id, target=admin.email)
        return admin

    def login(self, email: str, password: str, request: Request) -> AdminTokenResponse:
        normalized_email = email.strip().lower()
        check_rate_limit(
            f"admin-login:{self._get_client_ip(request) or normalized_email}",
            scope="admin-login",
            limit=5,
            window_seconds=60,
        )
        admin = self.db.query(Admin).filter(func.lower(Admin.email) == normalized_email).first()
        if admin is None or not self._verify_or_migrate_password(admin, password):
            audit_event(
                "admin.login.failed",
                outcome="failed",
                ip_address=self._get_client_ip(request),
                target=normalized_email,
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")
        if not admin.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account is inactive")
        if str(admin.role or "").strip().lower() != ADMIN_ROLE:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        admin.last_login_at = self._utcnow()
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        self._write_audit_log(admin, "admin.login", target_type="admin", target_id=str(admin.id), request=request)
        return AdminTokenResponse(access_token=create_admin_access_token(admin))

    def get_dashboard(self, admin: Admin) -> dict[str, object]:
        self._write_audit_log(admin, "admin.dashboard.read", target_type="dashboard")
        return {
            "message": "Welcome Admin",
            "admin": {
                "id": admin.id,
                "email": admin.email,
                "role": str(admin.role or ADMIN_ROLE).strip().lower(),
                "is_active": bool(admin.is_active),
                "last_login_at": admin.last_login_at,
            },
        }

    def request_password_reset(self, email: str, request: Request) -> AdminForgotPasswordResponse:
        normalized_email = email.strip().lower()
        check_rate_limit(
            f"admin-forgot-password:{self._get_client_ip(request) or normalized_email}",
            scope="admin-forgot-password",
            limit=3,
            window_seconds=900,
        )
        admin = self.db.query(Admin).filter(func.lower(Admin.email) == normalized_email).first()
        if admin is None or str(admin.role or "").strip().lower() != ADMIN_ROLE or not admin.is_active:
            return AdminForgotPasswordResponse(
                message="If an admin account exists, password reset instructions have been generated."
            )

        raw_token = secrets.token_urlsafe(32)
        expires_at = self._utcnow() + timedelta(minutes=30)
        admin.reset_token_hash = self._hash_reset_token(raw_token)
        admin.reset_token_expiry = expires_at
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        logger.info(
            "Admin password reset token generated email=%s delivery=mock expires_at=%s",
            normalized_email,
            expires_at.isoformat(),
        )
        audit_event(
            "admin.password_reset.requested",
            outcome="success",
            actor_id=admin.id,
            ip_address=self._get_client_ip(request),
            target=admin.email,
        )
        return AdminForgotPasswordResponse(
            message="If an admin account exists, password reset instructions have been generated.",
            email_sent=False,
            reset_token=raw_token,
            expires_at=expires_at,
        )

    def reset_password(self, payload: AdminResetPasswordRequest, request: Request) -> AdminMessageResponse:
        check_rate_limit(
            f"admin-reset-password:{self._get_client_ip(request) or 'unknown'}",
            scope="admin-reset-password",
            limit=10,
            window_seconds=900,
        )
        admin = self.db.query(Admin).filter(Admin.reset_token_hash == self._hash_reset_token(payload.token)).first()
        if (
            admin is None
            or str(admin.role or "").strip().lower() != ADMIN_ROLE
            or admin.reset_token_expiry is None
            or admin.reset_token_expiry < self._utcnow()
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired admin reset token")

        admin.hashed_password = get_password_hash(payload.new_password)
        admin.reset_token_hash = None
        admin.reset_token_expiry = None
        admin.is_active = True
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        audit_event(
            "admin.password_reset.completed",
            outcome="success",
            actor_id=admin.id,
            ip_address=self._get_client_ip(request),
            target=admin.email,
        )
        return AdminMessageResponse(message="Admin password reset completed successfully.")

    def request_access(self, payload: AdminAccessRequestCreate, request: Request) -> AdminAccessRequestResponse:
        normalized_email = str(payload.email).strip().lower()
        check_rate_limit(
            f"admin-request-access:{self._get_client_ip(request) or normalized_email}",
            scope="admin-request-access",
            limit=3,
            window_seconds=3600,
        )
        existing_admin = self.db.query(Admin).filter(func.lower(Admin.email) == normalized_email).first()
        if existing_admin and str(existing_admin.role or "").strip().lower() == ADMIN_ROLE:
            return AdminAccessRequestResponse(
                message="An admin account already exists for this email. Use admin login or password recovery.",
                status="existing_account",
            )

        access_request = AdminAccessRequest(
            email=normalized_email,
            full_name=payload.full_name,
            organization_name=payload.organization_name,
            reason=payload.reason,
            status="pending",
        )
        self.db.add(access_request)
        self.db.commit()
        self.db.refresh(access_request)
        audit_event(
            "admin.request_access.created",
            outcome="success",
            ip_address=self._get_client_ip(request),
            target=normalized_email,
            metadata={
                "request_id": access_request.id,
                "organization_name": payload.organization_name,
            },
        )
        return AdminAccessRequestResponse(
            message="Admin access request submitted successfully.",
            request_id=access_request.id,
            status=access_request.status,
        )

    def get_metrics(self, admin: Admin) -> AdminMetricsResponse:
        total_users = int(self.db.query(func.count(User.id)).scalar() or 0)
        active_users = int(self.db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0)
        suspended_users = total_users - active_users
        total_requests = int(self.db.query(func.count(SecurityLog.id)).scalar() or 0)
        threats_blocked = int(
            self.db.query(func.count(SecurityLog.id))
            .filter(SecurityLog.status.in_([LogStatusEnum.BLOCKED, LogStatusEnum.REDACTED]))
            .scalar()
            or 0
        )
        active_api_keys = int(self.db.query(func.count(APIKey.id)).filter(APIKey.status == KeyStatusEnum.ACTIVE).scalar() or 0)
        quarantined_api_keys = int(
            self.db.query(func.count(APIKey.id)).filter(APIKey.status == KeyStatusEnum.QUARANTINED).scalar() or 0
        )
        avg_latency_ms = round(float(self.db.query(func.coalesce(func.avg(SecurityLog.latency_ms), 0)).scalar() or 0), 2)

        now = datetime.now(timezone.utc)
        series_rows = (
            self.db.query(
                func.date(SecurityLog.timestamp).label("day"),
                func.count(SecurityLog.id).label("requests"),
                func.sum(
                    case(
                        (SecurityLog.status.in_([LogStatusEnum.BLOCKED, LogStatusEnum.REDACTED]), 1),
                        else_=0,
                    )
                ).label("threats"),
            )
            .filter(SecurityLog.timestamp >= now - timedelta(days=7))
            .group_by(func.date(SecurityLog.timestamp))
            .order_by(func.date(SecurityLog.timestamp).asc())
            .all()
        )
        points = [
            AdminMetricsSeriesPoint(label=str(day), requests=int(requests or 0), threats=int(threats or 0))
            for day, requests, threats in series_rows
        ]

        self._write_audit_log(admin, "admin.metrics.read", target_type="metrics")
        return AdminMetricsResponse(
            total_users=total_users,
            active_users=active_users,
            suspended_users=suspended_users,
            total_requests=total_requests,
            threats_blocked=threats_blocked,
            active_api_keys=active_api_keys,
            quarantined_api_keys=quarantined_api_keys,
            avg_latency_ms=avg_latency_ms,
            requests_last_7_days=points,
        )

    def get_system_status(self, admin: Admin) -> AdminSystemStatusResponse:
        database = "ok"
        try:
            self.db.execute(text("SELECT 1"))
        except Exception:
            database = "error"

        latest_security_event_at = self.db.query(func.max(SecurityLog.timestamp)).scalar()
        status_value = "ok" if database == "ok" else "degraded"
        payload = AdminSystemStatusResponse(
            status=status_value,
            database=database,
            uptime_hint="Gateway operational",
            admin_count=int(self.db.query(func.count(Admin.id)).scalar() or 0),
            last_security_event_at=latest_security_event_at,
        )
        self._write_audit_log(admin, "admin.system_status.read", target_type="system")
        return payload

    def list_users(
        self,
        admin: Admin,
        limit: int,
        offset: int,
        q: str | None,
        is_active: bool | None = None,
        tier: str | None = None,
    ) -> list[AdminUserSummary]:
        usage_subquery = (
            self.db.query(
                Usage.user_id.label("user_id"),
                func.coalesce(func.sum(Usage.requests_count), 0).label("api_usage"),
            )
            .group_by(Usage.user_id)
            .subquery()
        )
        key_subquery = (
            self.db.query(
                APIKey.user_id.label("user_id"),
                func.count(APIKey.id).label("api_key_count"),
            )
            .group_by(APIKey.user_id)
            .subquery()
        )
        query = (
            self.db.query(
                User,
                func.coalesce(usage_subquery.c.api_usage, 0).label("api_usage"),
                func.coalesce(key_subquery.c.api_key_count, 0).label("api_key_count"),
            )
            .outerjoin(usage_subquery, usage_subquery.c.user_id == User.id)
            .outerjoin(key_subquery, key_subquery.c.user_id == User.id)
        )
        if q:
            term = f"%{q.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(User.email).like(term),
                    func.lower(func.coalesce(User.organization_name, "")).like(term),
                )
            )
        if is_active is not None:
            query = query.filter(User.is_active.is_(is_active))
        if tier:
            query = query.filter(User.tier == tier)
        rows = (
            query.order_by(User.created_at.desc(), User.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        payload = [
            AdminUserSummary(
                id=user.id,
                email=user.email,
                tier=user.tier,
                organization_name=user.organization_name,
                is_active=user.is_active,
                monthly_limit=user.monthly_limit,
                created_at=user.created_at,
                api_usage=int(api_usage or 0),
                api_key_count=int(api_key_count or 0),
            )
            for user, api_usage, api_key_count in rows
        ]
        self._write_audit_log(admin, "admin.users.list", target_type="user", metadata={"count": len(payload)})
        return payload

    def delete_user(self, admin: Admin, user_id: int) -> dict:
        user = self._get_user_or_404(user_id)
        email = user.email
        self.db.delete(user)
        self.db.commit()
        self._write_audit_log(
            admin,
            "admin.users.delete",
            target_type="user",
            target_id=str(user_id),
            metadata={"email": email},
        )
        return {"deleted": True, "user_id": user_id}

    def update_user_status(self, admin: Admin, user_id: int, payload: AdminUserStatusUpdate) -> AdminUserSummary:
        user = self._get_user_or_404(user_id)
        user.is_active = payload.is_active
        self.db.commit()
        self.db.refresh(user)
        self._write_audit_log(
            admin,
            "admin.users.status.update",
            target_type="user",
            target_id=str(user_id),
            metadata={"is_active": payload.is_active},
        )
        return self._serialize_user(user)

    def list_logs(
        self,
        admin: Admin,
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
        risk_level: str | None = None,
        threat_type: str | None = None,
        only_quarantined: bool | None = None,
    ) -> list[AdminSecurityLogResponse]:
        rows = self._base_logs_query(
            limit,
            offset,
            q,
            status=status,
            risk_level=risk_level,
            threat_type=threat_type,
            only_quarantined=only_quarantined,
        ).all()
        payload = [self._serialize_log(row) for row in rows]
        self._write_audit_log(admin, "admin.logs.list", target_type="security_log", metadata={"count": len(payload)})
        return payload

    def list_threats(
        self,
        admin: Admin,
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
        risk_level: str | None = None,
        threat_type: str | None = None,
        only_quarantined: bool | None = None,
    ) -> list[AdminSecurityLogResponse]:
        rows = (
            self._base_logs_query(
                limit,
                offset,
                q,
                apply_pagination=False,
                status=status,
                risk_level=risk_level,
                threat_type=threat_type,
                only_quarantined=only_quarantined,
            )
            .filter(
                or_(
                    SecurityLog.status.in_([LogStatusEnum.BLOCKED, LogStatusEnum.REDACTED]),
                    SecurityLog.threat_type.isnot(None),
                    SecurityLog.is_quarantined.is_(True),
                )
            )
            .offset(offset)
            .limit(limit)
            .all()
        )
        payload = [self._serialize_log(row) for row in rows]
        self._write_audit_log(admin, "admin.threats.list", target_type="security_log", metadata={"count": len(payload)})
        return payload

    def list_api_keys(
        self,
        admin: Admin,
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
    ) -> list[AdminApiKeyResponse]:
        query = self.db.query(APIKey, User.email).join(User, User.id == APIKey.user_id)
        if q:
            term = f"%{q.strip().lower()}%"
            query = query.filter(
                or_(func.lower(User.email).like(term), func.lower(func.coalesce(APIKey.name, "")).like(term))
            )
        if status:
            query = query.filter(APIKey.status == status)
        rows = (
            query.order_by(APIKey.created_at.desc(), APIKey.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        payload = [
            AdminApiKeyResponse(
                id=api_key.id,
                user_id=api_key.user_id,
                user_email=user_email,
                name=api_key.name,
                prefix=api_key.prefix,
                status=api_key.status,
                usage_count=int(api_key.usage_count or 0),
                last_used=api_key.last_used,
                last_ip=api_key.last_ip,
                created_at=api_key.created_at,
            )
            for api_key, user_email in rows
        ]
        self._write_audit_log(admin, "admin.api_keys.list", target_type="api_key", metadata={"count": len(payload)})
        return payload

    def create_gateway_api_key(self, admin: Admin, payload: AdminApiKeyCreateRequest) -> AdminApiKeyResponse:
        user = self._get_user_or_404(payload.user_id)
        created, raw_key = create_api_key(self.db, user.id, APIKeyCreate(name=payload.name))
        self._write_audit_log(
            admin,
            "admin.api_keys.create",
            target_type="api_key",
            target_id=str(created.id),
            metadata={"user_id": user.id, "name": payload.name},
        )
        return AdminApiKeyResponse(
            id=created.id,
            user_id=user.id,
            user_email=user.email,
            name=created.name,
            prefix=created.prefix,
            status=created.status,
            usage_count=int(created.usage_count or 0),
            last_used=created.last_used,
            last_ip=created.last_ip,
            created_at=created.created_at,
            key=raw_key,
        )

    def revoke_gateway_api_key(self, admin: Admin, key_id: int) -> AdminApiKeyResponse:
        api_key = self.db.query(APIKey).filter(APIKey.id == key_id).first()
        if api_key is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
        revoked = revoke_api_key(self.db, api_key.user_id, key_id)
        user = self._get_user_or_404(revoked.user_id)
        self._write_audit_log(
            admin,
            "admin.api_keys.delete",
            target_type="api_key",
            target_id=str(key_id),
            metadata={"user_id": user.id},
        )
        return AdminApiKeyResponse(
            id=revoked.id,
            user_id=user.id,
            user_email=user.email,
            name=revoked.name,
            prefix=revoked.prefix,
            status=revoked.status,
            usage_count=int(revoked.usage_count or 0),
            last_used=revoked.last_used,
            last_ip=revoked.last_ip,
            created_at=revoked.created_at,
        )

    def get_settings(self, admin: Admin) -> AdminSettingsResponse:
        settings = self._get_or_create_platform_settings()
        self._write_audit_log(admin, "admin.settings.read", target_type="settings")
        return self._serialize_settings(settings)

    def update_settings(self, admin: Admin, payload: AdminSettingsUpdateRequest) -> AdminSettingsResponse:
        settings = self._get_or_create_platform_settings()
        settings.enable_gemini_module = payload.enable_gemini_module
        settings.enable_openai_module = payload.enable_openai_module
        settings.enable_anthropic_module = payload.enable_anthropic_module
        settings.ai_kill_switch_enabled = payload.ai_kill_switch_enabled
        settings.require_mfa_for_admin = payload.require_mfa_for_admin
        settings.admin_rate_limit_per_minute = payload.admin_rate_limit_per_minute
        settings.admin_rate_limit_window_seconds = payload.admin_rate_limit_window_seconds
        settings.api_key_rate_limit_per_minute = payload.api_key_rate_limit_per_minute
        settings.updated_by_user_id = admin.id
        self.db.add(settings)
        self.db.commit()
        self.db.refresh(settings)
        self._write_audit_log(
            admin,
            "admin.settings.update",
            target_type="settings",
            target_id=str(settings.id),
            metadata=payload.model_dump(),
        )
        return self._serialize_settings(settings)

    def _get_user_or_404(self, user_id: int) -> User:
        user = self.db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    def _serialize_user(self, user: User) -> AdminUserSummary:
        api_usage = int(
            self.db.query(func.coalesce(func.sum(Usage.requests_count), 0)).filter(Usage.user_id == user.id).scalar() or 0
        )
        api_key_count = int(self.db.query(func.count(APIKey.id)).filter(APIKey.user_id == user.id).scalar() or 0)
        return AdminUserSummary(
            id=user.id,
            email=user.email,
            tier=user.tier,
            organization_name=user.organization_name,
            is_active=user.is_active,
            monthly_limit=user.monthly_limit,
            created_at=user.created_at,
            api_usage=api_usage,
            api_key_count=api_key_count,
        )

    def _base_logs_query(
        self,
        limit: int,
        offset: int,
        q: str | None,
        apply_pagination: bool = True,
        status: str | None = None,
        risk_level: str | None = None,
        threat_type: str | None = None,
        only_quarantined: bool | None = None,
    ):
        query = (
            self.db.query(SecurityLog, User.id, User.email)
            .outerjoin(APIKey, APIKey.id == SecurityLog.api_key_id)
            .outerjoin(User, User.id == APIKey.user_id)
        )
        if q:
            term = f"%{q.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(func.coalesce(User.email, "")).like(term),
                    func.lower(func.coalesce(SecurityLog.threat_type, "")).like(term),
                    func.lower(func.coalesce(SecurityLog.endpoint, "")).like(term),
                )
            )
        if status:
            query = query.filter(SecurityLog.status == status)
        if risk_level:
            query = query.filter(func.lower(func.coalesce(SecurityLog.risk_level, "")) == risk_level.strip().lower())
        if threat_type:
            query = query.filter(func.lower(func.coalesce(SecurityLog.threat_type, "")) == threat_type.strip().lower())
        if only_quarantined is not None:
            query = query.filter(SecurityLog.is_quarantined.is_(only_quarantined))
        query = query.order_by(desc(SecurityLog.timestamp), desc(SecurityLog.id))
        if apply_pagination:
            query = query.offset(offset).limit(limit)
        return query

    def _get_or_create_platform_settings(self) -> AdminPlatformSettings:
        settings = self.db.query(AdminPlatformSettings).order_by(AdminPlatformSettings.id.asc()).first()
        if settings:
            return settings
        settings = AdminPlatformSettings()
        self.db.add(settings)
        self.db.commit()
        self.db.refresh(settings)
        return settings

    @staticmethod
    def _serialize_settings(settings: AdminPlatformSettings) -> AdminSettingsResponse:
        return AdminSettingsResponse(
            enable_gemini_module=settings.enable_gemini_module,
            enable_openai_module=settings.enable_openai_module,
            enable_anthropic_module=settings.enable_anthropic_module,
            ai_kill_switch_enabled=settings.ai_kill_switch_enabled,
            require_mfa_for_admin=settings.require_mfa_for_admin,
            admin_rate_limit_per_minute=settings.admin_rate_limit_per_minute,
            admin_rate_limit_window_seconds=settings.admin_rate_limit_window_seconds,
            api_key_rate_limit_per_minute=settings.api_key_rate_limit_per_minute,
            updated_by_user_id=settings.updated_by_user_id,
            updated_at=settings.updated_at,
        )

    def _serialize_log(self, row) -> AdminSecurityLogResponse:
        log, user_id, user_email = row
        return AdminSecurityLogResponse(
            id=log.id,
            timestamp=log.timestamp,
            api_key_id=log.api_key_id,
            user_id=user_id,
            user_email=user_email,
            status=log.status,
            threat_type=log.threat_type,
            threat_types=log.threat_types,
            threat_score=log.threat_score,
            risk_score=log.risk_score,
            attack_vector=log.attack_vector,
            risk_level=log.risk_level,
            endpoint=log.endpoint,
            method=log.method,
            model=log.model,
            latency_ms=int(log.latency_ms or 0),
            tokens_used=int(log.tokens_used or 0),
            ip_address=log.ip_address,
            is_quarantined=bool(log.is_quarantined),
            raw_payload=log.raw_payload,
        )

    def _write_audit_log(
        self,
        admin: Admin,
        action: str,
        *,
        target_type: str | None = None,
        target_id: str | None = None,
        request: Request | None = None,
        metadata: dict | None = None,
    ) -> None:
        log = AdminAuditLog(
            admin_user_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=self._get_client_ip(request) if request else None,
            method=request.method if request else None,
            path=request.url.path if request else None,
            event_metadata=metadata or {},
        )
        self.db.add(log)
        self.db.commit()
        audit_event(
            action,
            outcome="success",
            actor_id=admin.id,
            ip_address=self._get_client_ip(request) if request else None,
            target=target_id or target_type,
            metadata=metadata or {},
        )

    @staticmethod
    def _get_client_ip(request: Request | None) -> str | None:
        if request is None:
            return None
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else None

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _hash_reset_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _verify_or_migrate_password(self, admin: Admin, password: str) -> bool:
        if verify_password(password, admin.hashed_password):
            return True

        if admin.hashed_password == password:
            admin.hashed_password = get_password_hash(password)
            self.db.add(admin)
            self.db.commit()
            self.db.refresh(admin)
            return True

        return False
