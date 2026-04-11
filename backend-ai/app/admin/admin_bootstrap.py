from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from app.admin.admin_access_request_model import AdminAccessRequest
from app.admin.admin_model import Admin
from app.admin.admin_service import AdminService
from app.core.database import SessionLocal, engine
from app.models.admin_audit_log import AdminAuditLog
from app.models.admin_settings import AdminPlatformSettings

logger = logging.getLogger(__name__)

ADMIN_TABLES = (
    Admin.__table__,
    AdminAccessRequest.__table__,
    AdminAuditLog.__table__,
    AdminPlatformSettings.__table__,
)

ADMIN_COLUMN_DEFINITIONS = {
    "role": "VARCHAR(32) NOT NULL DEFAULT 'admin'",
    "reset_token_hash": "VARCHAR(128)",
    "reset_token_expiry": "DATETIME",
    "last_login_at": "DATETIME",
}

ADMIN_INDEX_DEFINITIONS = (
    ("ix_admins_role", "admins", "role"),
    ("ix_admins_reset_token_hash", "admins", "reset_token_hash"),
)


def _ensure_admin_tables() -> bool:
    schema_upgraded = False

    with engine.begin() as connection:
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())

        for table in ADMIN_TABLES:
            if table.name not in existing_tables:
                table.create(bind=connection, checkfirst=True)
                schema_upgraded = True

        inspector = inspect(connection)
        if "admins" in inspector.get_table_names():
            existing_columns = {column["name"] for column in inspector.get_columns("admins")}
            for column_name, definition in ADMIN_COLUMN_DEFINITIONS.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE admins ADD COLUMN {column_name} {definition}"))
                schema_upgraded = True

            connection.execute(text("UPDATE admins SET role = 'admin' WHERE role IS NULL OR TRIM(role) = ''"))

        for index_name, table_name, column_name in ADMIN_INDEX_DEFINITIONS:
            connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"))

    return schema_upgraded


def bootstrap_admin_system() -> None:
    schema_upgraded = _ensure_admin_tables()
    db = SessionLocal()
    try:
        admin = AdminService(db).ensure_default_admin(sync_password=schema_upgraded)
    finally:
        db.close()

    if admin is not None and schema_upgraded:
        logger.info("Admin SQL schema upgraded and bootstrap admin ensured")
    elif admin is None:
        logger.info("Admin SQL schema ready; bootstrap account was not created because credentials were not provided")
