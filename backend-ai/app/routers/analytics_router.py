from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import get_analytics_summary

router = APIRouter(tags=["analytics"])


@router.get("")
async def read_analytics(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await get_analytics_summary(request, current_user))
