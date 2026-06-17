from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.admin.admin_auth import decode_admin_token
from app.middleware.auth_middleware import (
    _build_current_user_context,
    get_current_user,
    oauth2_scheme,
)
from app.security.admin_access import has_platform_admin_access
from app.services.auth_service import get_user_by_id


async def _resolve_admin_from_admin_token(token: str):
    try:
        token_data = decode_admin_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    admin_user = await get_user_by_id(str(token_data["admin_id"]))
    if admin_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not bool(admin_user.get("is_active", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    if not bool(admin_user.get("is_verified", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    if not has_platform_admin_access(admin_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account does not have admin panel access.")

    return _build_current_user_context(admin_user)


async def get_admin_user(request: Request, token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_user = None
    try:
        current_user = await get_current_user(request, token)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_401_UNAUTHORIZED:
            raise

    if current_user is not None:
        if not has_platform_admin_access(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account does not have admin panel access.")
        return current_user

    return await _resolve_admin_from_admin_token(token)
