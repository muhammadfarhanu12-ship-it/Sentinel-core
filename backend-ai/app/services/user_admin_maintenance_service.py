from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.api_key import APIKey
from app.models.billing import BillingInvoice, BillingSubscription
from app.models.notification import Notification
from app.models.remediation_log import RemediationLog
from app.models.scan import ScanJob
from app.models.security_log import SecurityLog
from app.models.settings import UserSettings
from app.models.usage import Usage
from app.models.user import User, UserRoleEnum
from app.utils.hashing import get_password_hash


@dataclass(slots=True)
class MaintenanceDeleteCounts:
    users: int = 0
    api_keys: int = 0
    security_logs: int = 0
    remediation_logs: int = 0
    usage: int = 0
    scan_jobs: int = 0
    notifications: int = 0
    billing_subscriptions: int = 0
    billing_invoices: int = 0
    user_settings: int = 0


@dataclass(slots=True)
class MaintenancePreview:
    admin_exists: bool
    delete_counts: MaintenanceDeleteCounts


@dataclass(slots=True)
class MaintenanceResult:
    admin_created: bool
    delete_counts: MaintenanceDeleteCounts


class UserAdminMaintenanceService:
    """Legacy db-session cleanup helper kept for admin maintenance tests/tools.

    The production app now uses MongoDB for user administration. This class is a
    conservative compatibility shim for older SQLAlchemy-style maintenance code:
    it only operates on the session object passed to it and does not touch Mongo.
    """

    def __init__(self, db_session: Any):
        self.db = db_session

    @staticmethod
    def _normalize_email(email: str) -> str:
        return str(email or "").strip().lower()

    def _admin_rows(self, admin_email: str) -> list[Any]:
        normalized = self._normalize_email(admin_email)
        return [
            user
            for user in self.db.query(User).all()
            if self._normalize_email(getattr(user, "email", "")) == normalized
        ]

    def _non_admin_users(self, admin_email: str) -> list[Any]:
        normalized = self._normalize_email(admin_email)
        return [
            user
            for user in self.db.query(User).all()
            if self._normalize_email(getattr(user, "email", "")) != normalized
        ]

    def _count_dependencies(self, users: list[Any]) -> MaintenanceDeleteCounts:
        user_ids = {getattr(user, "id", None) for user in users}

        def count_model(model: type[Any], field_name: str = "user_id") -> int:
            return sum(
                1
                for row in self.db.query(model).all()
                if getattr(row, field_name, None) in user_ids
            )

        api_keys = [
            key for key in self.db.query(APIKey).all()
            if getattr(key, "user_id", None) in user_ids
        ]
        api_key_ids = {getattr(key, "id", None) for key in api_keys}
        security_logs = [
            row for row in self.db.query(SecurityLog).all()
            if getattr(row, "api_key_id", None) in api_key_ids
        ]
        security_log_ids = {getattr(row, "id", None) for row in security_logs}
        remediation_logs = [
            row for row in self.db.query(RemediationLog).all()
            if getattr(row, "user_id", None) in user_ids
            or getattr(row, "api_key_id", None) in api_key_ids
            or getattr(row, "security_log_id", None) in security_log_ids
        ]

        return MaintenanceDeleteCounts(
            users=len(users),
            api_keys=len(api_keys),
            security_logs=len(security_logs),
            remediation_logs=len(remediation_logs),
            usage=count_model(Usage),
            scan_jobs=count_model(ScanJob),
            notifications=count_model(Notification),
            billing_subscriptions=count_model(BillingSubscription),
            billing_invoices=count_model(BillingInvoice),
            user_settings=count_model(UserSettings),
        )

    def preview_cleanup(self, *, admin_email: str) -> MaintenancePreview:
        admin_rows = self._admin_rows(admin_email)
        if len(admin_rows) > 1:
            raise RuntimeError("Multiple users match the requested admin email.")
        users_to_delete = self._non_admin_users(admin_email)
        return MaintenancePreview(
            admin_exists=bool(admin_rows),
            delete_counts=self._count_dependencies(users_to_delete),
        )

    def prune_users_except_admin(
        self,
        *,
        admin_email: str,
        admin_password: str,
        confirmed: bool,
    ) -> MaintenanceResult:
        if not confirmed:
            raise PermissionError("Cleanup requires explicit confirmation.")

        preview = self.preview_cleanup(admin_email=admin_email)
        admin_rows = self._admin_rows(admin_email)
        admin_created = not bool(admin_rows)
        normalized_email = self._normalize_email(admin_email)

        if admin_rows:
            admin = admin_rows[0]
            admin.email = normalized_email
            admin.hashed_password = get_password_hash(admin_password)
            admin.role = UserRoleEnum.SUPER_ADMIN
            admin.is_active = True
            admin.is_verified = True
            self.db.add(admin)
        else:
            self.db.add(
                User(
                    email=normalized_email,
                    hashed_password=get_password_hash(admin_password),
                    role=UserRoleEnum.SUPER_ADMIN,
                    is_active=True,
                    is_verified=True,
                    organization_name=normalized_email.split("@")[-1] if "@" in normalized_email else None,
                )
            )

        users_to_delete = self._non_admin_users(admin_email)
        user_ids_to_delete = {getattr(user, "id", None) for user in users_to_delete}
        api_key_ids_to_delete = {
            getattr(key, "id", None)
            for key in self.db.query(APIKey).all()
            if getattr(key, "user_id", None) in user_ids_to_delete
        }
        security_log_ids_to_delete = {
            getattr(row, "id", None)
            for row in self.db.query(SecurityLog).all()
            if getattr(row, "api_key_id", None) in api_key_ids_to_delete
        }
        for model in (
            RemediationLog,
            SecurityLog,
            APIKey,
            Usage,
            ScanJob,
            Notification,
            BillingSubscription,
            BillingInvoice,
            UserSettings,
        ):
            for row in list(self.db.query(model).all()):
                owner_id = getattr(row, "user_id", None)
                if owner_id in user_ids_to_delete:
                    self.db.delete(row)
                    continue
                if isinstance(row, SecurityLog) and getattr(row, "api_key_id", None) in api_key_ids_to_delete:
                    self.db.delete(row)
                    continue
                if isinstance(row, RemediationLog) and (
                    getattr(row, "api_key_id", None) in api_key_ids_to_delete
                    or getattr(row, "security_log_id", None) in security_log_ids_to_delete
                ):
                    self.db.delete(row)
        for user in users_to_delete:
            self.db.delete(user)

        self.db.commit()
        return MaintenanceResult(admin_created=admin_created, delete_counts=preview.delete_counts)
