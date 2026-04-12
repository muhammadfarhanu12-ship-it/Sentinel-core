from __future__ import annotations

import logging

from app.core.config import settings
from app.services.admin_user_service import ensure_admin_user

logger = logging.getLogger(__name__)


async def bootstrap_admin_system() -> None:
    admin_password = str(settings.ADMIN_BOOTSTRAP_PASSWORD or "").strip()
    if not admin_password:
        logger.info("Admin bootstrap skipped because ADMIN_BOOTSTRAP_PASSWORD is not configured")
        return

    admin_email = str(settings.ADMIN_BOOTSTRAP_EMAIL or "admin@example.com").strip().lower()
    admin_user = await ensure_admin_user(email=admin_email, password=admin_password, name="Sentinel Admin")
    logger.info("Admin bootstrap ensured email=%s role=%s", admin_user.email, admin_user.role)
