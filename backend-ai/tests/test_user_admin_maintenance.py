from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.api_key import APIKey, KeyStatusEnum
from app.models.billing import BillingInvoice, BillingSubscription
from app.models.notification import Notification
from app.models.remediation_log import RemediationLog
from app.models.scan import ScanJob
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.settings import UserSettings
from app.models.usage import Usage
from app.models.user import User, UserRoleEnum
from app.services.user_admin_maintenance_service import UserAdminMaintenanceService
from app.utils.hashing import get_password_hash, verify_password

ADMIN_EMAIL = "admin@example.com"


def _create_user(db_session, *, email: str, password: str, role: UserRoleEnum = UserRoleEnum.ANALYST) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        organization_name="example.com",
        role=role,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _seed_user_dependencies(db_session, user: User) -> None:
    api_key = APIKey(
        user_id=user.id,
        prefix=f"sk_{user.id:08d}",
        key_hash=get_password_hash(f"raw-key-{user.id}"),
        name="Primary Key",
        status=KeyStatusEnum.ACTIVE,
    )
    db_session.add(api_key)
    db_session.commit()
    db_session.refresh(api_key)

    security_log = SecurityLog(
        api_key_id=api_key.id,
        status=LogStatusEnum.BLOCKED,
        threat_type="Prompt Injection",
        threat_types=["Prompt Injection"],
        threat_score=0.98,
        risk_score=0.95,
        attack_vector="prompt",
        risk_level="high",
    )
    db_session.add(security_log)
    db_session.add(Usage(user_id=user.id, month="2026-04", requests_count=12, tokens_count=345))
    db_session.add(ScanJob(user_id=user.id, scan_type="prompt", target="demo"))
    db_session.add(Notification(user_id=user.id, title="Alert", message="Blocked prompt", type="security"))
    db_session.add(BillingSubscription(user_id=user.id, plan_name="PRO"))
    db_session.add(
        BillingInvoice(
            user_id=user.id,
            invoice_number=f"INV-{user.id}",
            amount=Decimal("19.99"),
            currency="USD",
        )
    )
    db_session.add(
        UserSettings(
            user_id=user.id,
            scan_sensitivity="high",
            auto_redact_pii=True,
            block_on_injection=True,
            alert_threshold=0.9,
            email_alerts=True,
            in_app_alerts=True,
            max_daily_scans=50,
        )
    )
    db_session.commit()
    db_session.refresh(security_log)

    db_session.add(
        RemediationLog(
            user_id=user.id,
            api_key_id=api_key.id,
            security_log_id=security_log.id,
            request_id=f"req-{user.id}",
            threat_type="Prompt Injection",
            threat_score=0.98,
            actions=[{"action": "block", "status": "success"}],
        )
    )
    db_session.commit()


def test_preview_and_cleanup_create_admin_and_remove_non_admin_users(db_session):
    analyst = _create_user(db_session, email="analyst@example.com", password="AnalystPass!123")
    _seed_user_dependencies(db_session, analyst)

    service = UserAdminMaintenanceService(db_session)
    preview = service.preview_cleanup(admin_email=ADMIN_EMAIL)

    assert preview.admin_exists is False
    assert preview.delete_counts.users == 1
    assert preview.delete_counts.api_keys == 1
    assert preview.delete_counts.security_logs == 1
    assert preview.delete_counts.remediation_logs == 1

    result = service.prune_users_except_admin(
        admin_email=ADMIN_EMAIL,
        admin_password="NewAdminPass!123",
        confirmed=True,
    )

    users = db_session.query(User).order_by(User.id.asc()).all()
    assert len(users) == 1
    admin = users[0]
    assert admin.email == ADMIN_EMAIL
    assert admin.role == UserRoleEnum.SUPER_ADMIN
    assert verify_password("NewAdminPass!123", admin.hashed_password)
    assert result.admin_created is True
    assert result.delete_counts.users == 1
    assert db_session.query(APIKey).count() == 0
    assert db_session.query(SecurityLog).count() == 0
    assert db_session.query(RemediationLog).count() == 0
    assert db_session.query(Usage).count() == 0
    assert db_session.query(ScanJob).count() == 0
    assert db_session.query(Notification).count() == 0
    assert db_session.query(BillingSubscription).count() == 0
    assert db_session.query(BillingInvoice).count() == 0
    assert db_session.query(UserSettings).count() == 0


def test_cleanup_updates_existing_admin_password_and_keeps_admin_row(db_session):
    original_admin = _create_user(
        db_session,
        email="Admin@Example.com",
        password="OldAdminPass!123",
        role=UserRoleEnum.ANALYST,
    )
    _create_user(db_session, email="member@example.com", password="MemberPass!123")

    service = UserAdminMaintenanceService(db_session)
    result = service.prune_users_except_admin(
        admin_email=ADMIN_EMAIL,
        admin_password="RotatedAdminPass!123",
        confirmed=True,
    )

    users = db_session.query(User).order_by(User.id.asc()).all()
    assert len(users) == 1
    admin = users[0]
    assert admin.id == original_admin.id
    assert admin.email == ADMIN_EMAIL
    assert admin.role == UserRoleEnum.SUPER_ADMIN
    assert verify_password("RotatedAdminPass!123", admin.hashed_password)
    assert result.admin_created is False
    assert result.delete_counts.users == 1


def test_cleanup_requires_confirmation(db_session):
    _create_user(db_session, email="member@example.com", password="MemberPass!123")

    service = UserAdminMaintenanceService(db_session)
    with pytest.raises(PermissionError):
        service.prune_users_except_admin(
            admin_email=ADMIN_EMAIL,
            admin_password="RotatedAdminPass!123",
            confirmed=False,
        )

    assert db_session.query(User).count() == 1


def test_preview_rejects_case_insensitive_admin_duplicates(db_session):
    _create_user(db_session, email="Admin@example.com", password="AdminPass!123")
    _create_user(db_session, email="admin@example.com", password="AdminPass!456")

    service = UserAdminMaintenanceService(db_session)
    with pytest.raises(RuntimeError):
        service.preview_cleanup(admin_email=ADMIN_EMAIL)
