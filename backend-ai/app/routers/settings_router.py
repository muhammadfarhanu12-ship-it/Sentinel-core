from typing import Any

from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import ensure_user_settings, update_user_settings

router = APIRouter(tags=["settings"])


@router.get("")
async def read_settings(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await ensure_user_settings(request, current_user))


@router.put("")
async def write_settings(payload: dict[str, Any], request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await update_user_settings(request, current_user, payload))
