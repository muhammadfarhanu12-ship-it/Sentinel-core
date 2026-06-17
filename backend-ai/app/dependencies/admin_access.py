from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status

from app.middleware.auth_middleware import get_current_admin
from app.security.admin_access import has_admin_permission


def require_admin_permission(permission: str):
    async def dependency(current_admin: dict[str, Any] = Depends(get_current_admin)) -> dict[str, Any]:
        if not has_admin_permission(current_admin, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin permission required.",
            )
        return current_admin

    return dependency
