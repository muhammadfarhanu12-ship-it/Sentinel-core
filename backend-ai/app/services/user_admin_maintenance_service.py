from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

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

logger = logging.getLogger(__name__)


@dataclass(slots=True, frozen=True)
class DeleteCounts:
    users: int = 0
    api_keys: int = 0
    security_logs: int = 0
    remediation_logs: int = 0
    usage_rows: int = 0
    scan_jobs: int = 0
    notifications: int = 0
    billing_subscriptions: int = 0
    billing_invoices: int = 0
    user_settings: int = 0


@dataclass(slots=True, frozen=True)
class UserCleanupPreview:
    admin_email: str
    admin_exists: bool
    delete_counts: DeleteCounts


@dataclass(slots=True, frozen=True)
class UserCleanupResult:
    admin_email: str
    admin_user_id: int
    admin_created: bool
    admin_password_updated: bool
    delete_counts: DeleteCounts


class UserAdminMaintenanceService:
    def __init__(self, db: Session):
        self.db = db

    def preview_cleanup(self, *, admin_email: str) -> UserCleanupPreview:
        normalized_email = self._normalize_email(admin_email)
        self._validate_admin_email(normalized_email)

        matching_admins = self._load_matching_admins(normalized_email)
        if len(matching_admins) > 1:
            raise RuntimeError(
                f"Multiple user rows match {normalized_email!r} case-insensitively. Resolve the duplicates before cleanup."
            )

        return UserCleanupPreview(
            admin_email=normalized_email,
            admin_exists=bool(matching_admins),
            delete_counts=self._collect_delete_counts(normalized_email),
        )

    def prune_users_except_admin(
        self,
        *,
        admin_email: str,
        admin_password: str,
        confirmed: bool,
    ) -> UserCleanupResult:
        normalized_email = self._normalize_email(admin_email)
        self._validate_admin_email(normalized_email)
        self._validate_admin_password(admin_password)

        if not confirmed:
            raise PermissionError("Explicit confirmation is required before deleting non-admin users.")

        delete_counts = self._collect_delete_counts(normalized_email)

        try:
            admin, admin_created = self._ensure_admin(
                admin_email=normalized_email,
                admin_password=admin_password,
            )

            user_ids_to_delete = self._user_ids_to_delete_query(normalized_email)
            api_key_ids_to_delete = select(APIKey.id).where(APIKey.user_id.in_(user_ids_to_delete))
            security_log_ids_to_delete = select(SecurityLog.id).where(SecurityLog.api_key_id.in_(api_key_ids_to_delete))

            # Delete child rows first because several tables reference users/api keys
            # without ON DELETE CASCADE across all supported databases.
            if delete_counts.remediation_logs:
                self.db.execute(
                    delete(RemediationLog).where(
                        or_(
                            RemediationLog.user_id.in_(user_ids_to_delete),
                            RemediationLog.api_key_id.in_(api_key_ids_to_delete),
                            RemediationLog.security_log_id.in_(security_log_ids_to_delete),
                        )
                    )
                )
            if delete_counts.security_logs:
                self.db.execute(delete(SecurityLog).where(SecurityLog.id.in_(security_log_ids_to_delete)))
            if delete_counts.notifications:
                self.db.execute(delete(Notification).where(Notification.user_id.in_(user_ids_to_delete)))
            if delete_counts.user_settings:
                self.db.execute(delete(UserSettings).where(UserSettings.user_id.in_(user_ids_to_delete)))
            if delete_counts.usage_rows:
                self.db.execute(delete(Usage).where(Usage.user_id.in_(user_ids_to_delete)))
            if delete_counts.scan_jobs:
                self.db.execute(delete(ScanJob).where(ScanJob.user_id.in_(user_ids_to_delete)))
            if delete_counts.billing_subscriptions:
                self.db.execute(delete(BillingSubscription).where(BillingSubscription.user_id.in_(user_ids_to_delete)))
            if delete_counts.billing_invoices:
                self.db.execute(delete(BillingInvoice).where(BillingInvoice.user_id.in_(user_ids_to_delete)))
            if delete_counts.api_keys:
                self.db.execute(delete(APIKey).where(APIKey.id.in_(api_key_ids_to_delete)))
            if delete_counts.users:
                self.db.execute(delete(User).where(User.id.in_(user_ids_to_delete)))

            self.db.commit()
            logger.info(
                "User cleanup completed for admin=%s deleted_users=%s admin_created=%s",
                normalized_email,
                delete_counts.users,
                admin_created,
            )
            logger.info("Admin account %s %s successfully", normalized_email, "created" if admin_created else "updated")
            return UserCleanupResult(
                admin_email=normalized_email,
                admin_user_id=admin.id,
                admin_created=admin_created,
                admin_password_updated=True,
                delete_counts=delete_counts,
            )
        except SQLAlchemyError:
            self.db.rollback()
            logger.exception("Database cleanup failed for admin=%s", normalized_email)
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Unexpected admin maintenance failure for admin=%s", normalized_email)
            raise

    def _ensure_admin(self, *, admin_email: str, admin_password: str) -> tuple[User, bool]:
        matching_admins = self._load_matching_admins(admin_email)
        if len(matching_admins) > 1:
            raise RuntimeError(
                f"Multiple user rows match {admin_email!r} case-insensitively. Resolve the duplicates before cleanup."
            )

        admin = matching_admins[0] if matching_admins else None
        domain = admin_email.split("@", 1)[1]
        now = datetime.now(timezone.utc)

        if admin is None:
            admin = User(
                email=admin_email,
                hashed_password=get_password_hash(admin_password),
                organization_name=domain,
                role=UserRoleEnum.SUPER_ADMIN,
                is_active=True,
                is_verified=True,
                password_updated_at=now,
                email_verified_at=now,
            )
            self.db.add(admin)
            self.db.flush()
            return admin, True

        admin.email = admin_email
        admin.hashed_password = get_password_hash(admin_password)
        admin.organization_name = admin.organization_name or domain
        admin.role = UserRoleEnum.SUPER_ADMIN
        admin.is_active = True
        admin.is_verified = True
        admin.password_updated_at = now
        admin.email_verified_at = admin.email_verified_at or now
        admin.reset_token = None
        admin.reset_token_expiry = None
        admin.verification_token = None
        admin.verification_token_expiry = None
        self.db.add(admin)
        self.db.flush()
        return admin, False

    def _collect_delete_counts(self, admin_email: str) -> DeleteCounts:
        user_ids_to_delete = self._user_ids_to_delete_query(admin_email)
        api_key_ids_to_delete = select(APIKey.id).where(APIKey.user_id.in_(user_ids_to_delete))
        security_log_ids_to_delete = select(SecurityLog.id).where(SecurityLog.api_key_id.in_(api_key_ids_to_delete))

        return DeleteCounts(
            users=self._count_rows(User, User.id.in_(user_ids_to_delete)),
            api_keys=self._count_rows(APIKey, APIKey.id.in_(api_key_ids_to_delete)),
            security_logs=self._count_rows(SecurityLog, SecurityLog.id.in_(security_log_ids_to_delete)),
            remediation_logs=self._count_rows(
                RemediationLog,
                or_(
                    RemediationLog.user_id.in_(user_ids_to_delete),
                    RemediationLog.api_key_id.in_(api_key_ids_to_delete),
                    RemediationLog.security_log_id.in_(security_log_ids_to_delete),
                ),
            ),
            usage_rows=self._count_rows(Usage, Usage.user_id.in_(user_ids_to_delete)),
            scan_jobs=self._count_rows(ScanJob, ScanJob.user_id.in_(user_ids_to_delete)),
            notifications=self._count_rows(Notification, Notification.user_id.in_(user_ids_to_delete)),
            billing_subscriptions=self._count_rows(
                BillingSubscription,
                BillingSubscription.user_id.in_(user_ids_to_delete),
            ),
            billing_invoices=self._count_rows(BillingInvoice, BillingInvoice.user_id.in_(user_ids_to_delete)),
            user_settings=self._count_rows(UserSettings, UserSettings.user_id.in_(user_ids_to_delete)),
        )

    def _load_matching_admins(self, admin_email: str) -> list[User]:
        return (
            self.db.execute(
                select(User)
                .where(func.lower(User.email) == admin_email)
                .order_by(User.id.asc())
            )
            .scalars()
            .all()
        )

    @staticmethod
    def _normalize_email(email: str) -> str:
        return (email or "").strip().lower()

    @staticmethod
    def _validate_admin_email(email: str) -> None:
        if not email or "@" not in email:
            raise ValueError("A valid admin email is required.")

    @staticmethod
    def _validate_admin_password(password: str) -> None:
        if not password or not password.strip():
            raise ValueError("Admin password is required.")

    @staticmethod
    def _user_ids_to_delete_query(admin_email: str):
        return select(User.id).where(func.lower(User.email) != admin_email)

    def _count_rows(self, model, *conditions) -> int:
        statement = select(func.count()).select_from(model)
        for condition in conditions:
            statement = statement.where(condition)
        return int(self.db.scalar(statement) or 0)
