from __future__ import annotations

import argparse
import getpass
import logging
import os
import sys

from sqlalchemy import inspect

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.services.user_admin_maintenance_service import UserAdminMaintenanceService

DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_PASSWORD_ENV_VAR = "ADMIN_BOOTSTRAP_PASSWORD"
LEGACY_PASSWORD_ENV_VAR = "SENTINEL_ADMIN_PASSWORD"

logger = logging.getLogger("admin_user_maintenance")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Delete every user except the protected admin account and rotate the admin password safely.",
    )
    parser.add_argument(
        "--admin-email",
        default=settings.ADMIN_BOOTSTRAP_EMAIL or DEFAULT_ADMIN_EMAIL,
        help="Admin email to preserve or create. Defaults to %(default)s.",
    )
    parser.add_argument(
        "--password-env-var",
        default=DEFAULT_PASSWORD_ENV_VAR,
        help="Environment variable that contains the admin password. Defaults to %(default)s.",
    )
    parser.add_argument(
        "--confirm-email",
        help="Repeat the protected admin email to allow the destructive cleanup without an interactive prompt.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the rows that would be deleted without changing the database.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = build_parser().parse_args(argv)

    try:
        _validate_users_table()
        logger.warning("Backup recommendation: take a verified database backup before running this command.")

        preview_session = SessionLocal()
        try:
            preview = UserAdminMaintenanceService(preview_session).preview_cleanup(admin_email=args.admin_email)
        finally:
            preview_session.close()

        logger.info(
            "Preflight summary admin_exists=%s users_to_delete=%s api_keys_to_delete=%s security_logs_to_delete=%s "
            "remediation_logs_to_delete=%s",
            preview.admin_exists,
            preview.delete_counts.users,
            preview.delete_counts.api_keys,
            preview.delete_counts.security_logs,
            preview.delete_counts.remediation_logs,
        )

        if args.dry_run:
            logger.info("Dry run complete. No changes were written.")
            return 0

        _require_confirmation(preview.admin_email, args.confirm_email)
        admin_password = _resolve_admin_password(args.password_env_var)

        execution_session = SessionLocal()
        try:
            result = UserAdminMaintenanceService(execution_session).prune_users_except_admin(
                admin_email=preview.admin_email,
                admin_password=admin_password,
                confirmed=True,
            )
        finally:
            execution_session.close()

        logger.info("Deleted %s non-admin user record(s).", result.delete_counts.users)
        logger.info(
            "Admin account %s %s successfully.",
            result.admin_email,
            "created" if result.admin_created else "updated",
        )
        return 0
    except Exception:
        logger.exception("Admin user maintenance failed")
        return 1


def _validate_users_table() -> None:
    if not inspect(engine).has_table("users"):
        raise RuntimeError("The users table does not exist. Run migrations or initialize the database before cleanup.")


def _require_confirmation(admin_email: str, confirm_email: str | None) -> None:
    normalized_admin_email = admin_email.strip().lower()
    if confirm_email:
        if confirm_email.strip().lower() != normalized_admin_email:
            raise ValueError("Confirmation email does not match the protected admin email.")
        return

    if not sys.stdin.isatty():
        raise RuntimeError(
            f"Deletion confirmation required. Re-run with --confirm-email {normalized_admin_email} or use an interactive terminal."
        )

    typed_email = input(
        f"Type {normalized_admin_email} to confirm deletion of every other user record: "
    ).strip().lower()
    if typed_email != normalized_admin_email:
        raise RuntimeError("Confirmation did not match. Aborting without changes.")


def _resolve_admin_password(password_env_var: str) -> str:
    password = os.getenv(password_env_var)
    if not password and password_env_var == DEFAULT_PASSWORD_ENV_VAR:
        password = os.getenv(LEGACY_PASSWORD_ENV_VAR)
    if password:
        return password

    if not sys.stdin.isatty():
        raise RuntimeError(
            f"Admin password was not found in {password_env_var}. Set the environment variable or run interactively."
        )

    first = getpass.getpass("Enter the admin password to hash and store: ")
    second = getpass.getpass("Re-enter the admin password: ")
    if not first.strip():
        raise ValueError("Admin password cannot be empty.")
    if first != second:
        raise ValueError("Admin password confirmation did not match.")
    return first


if __name__ == "__main__":
    raise SystemExit(main())
