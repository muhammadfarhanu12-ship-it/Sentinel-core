from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import get_usage_summary

router = APIRouter(tags=["usage"])


@router.get("")
async def read_usage(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await get_usage_summary(request, current_user))
