from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import os
import sys

from app.core.config import settings
from app.database import close_mongo_connection, connect_to_mongo
from app.services.admin_user_service import ensure_admin_user

DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_ADMIN_EMAIL_ENV_VAR = "ADMIN_EMAIL"
FALLBACK_ADMIN_EMAIL_ENV_VAR = "ADMIN_BOOTSTRAP_EMAIL"
LEGACY_ADMIN_EMAIL_ENV_VAR = "SENTINEL_ADMIN_EMAIL"
DEFAULT_ADMIN_PASSWORD_ENV_VAR = "ADMIN_PASSWORD"
FALLBACK_ADMIN_PASSWORD_ENV_VAR = "ADMIN_BOOTSTRAP_PASSWORD"
LEGACY_ADMIN_PASSWORD_ENV_VAR = "SENTINEL_ADMIN_PASSWORD"

logger = logging.getLogger("create_admin_user")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create or promote a MongoDB auth user to role='admin'.")
    parser.add_argument(
        "--email",
        default=(
            os.getenv(DEFAULT_ADMIN_EMAIL_ENV_VAR)
            or os.getenv(FALLBACK_ADMIN_EMAIL_ENV_VAR)
            or os.getenv(LEGACY_ADMIN_EMAIL_ENV_VAR)
            or settings.ADMIN_BOOTSTRAP_EMAIL
            or DEFAULT_ADMIN_EMAIL
        ),
        help="Admin email to create or promote. Defaults to %(default)s.",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Optional display name for the admin account.",
    )
    parser.add_argument(
        "--password-env-var",
        default=DEFAULT_ADMIN_PASSWORD_ENV_VAR,
        help="Environment variable that contains the admin password. Defaults to %(default)s.",
    )
    return parser


def _resolve_password(password_env_var: str) -> str:
    password = os.getenv(password_env_var)
    if not password and password_env_var == DEFAULT_ADMIN_PASSWORD_ENV_VAR:
        password = os.getenv(FALLBACK_ADMIN_PASSWORD_ENV_VAR)
    if not password and password_env_var in {DEFAULT_ADMIN_PASSWORD_ENV_VAR, FALLBACK_ADMIN_PASSWORD_ENV_VAR}:
        password = os.getenv(LEGACY_ADMIN_PASSWORD_ENV_VAR)
    if password:
        return password

    if not sys.stdin.isatty():
        raise RuntimeError(
            f"Admin password was not found in {password_env_var}. Set the environment variable or run interactively."
        )

    first = getpass.getpass("Enter the admin password: ")
    second = getpass.getpass("Re-enter the admin password: ")
    if not first.strip():
        raise ValueError("Admin password cannot be empty.")
    if first != second:
        raise ValueError("Admin password confirmation did not match.")
    return first


async def _async_main(args: argparse.Namespace) -> int:
    await connect_to_mongo()
    try:
        password = _resolve_password(args.password_env_var)
        admin_user = await ensure_admin_user(email=args.email, password=password, name=args.name)
        logger.info(
            "Admin user is ready email=%s role=%s verified=%s",
            admin_user.email,
            admin_user.role,
            admin_user.is_verified,
        )
        return 0
    finally:
        await close_mongo_connection()


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = build_parser().parse_args(argv)
    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
