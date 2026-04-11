from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.middleware.auth_middleware import get_current_admin
from app.models.user_model import user_model
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.user_schema import UserResponse
from app.services.admin_user_service import list_users

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=ApiResponse[dict])
async def admin_dashboard(current_user: dict = Depends(get_current_admin)):
    return ok(
        {
            "message": "Welcome Admin",
            "user": UserResponse.model_validate(user_model(current_user)),
        }
    )


@router.get("/users", response_model=ApiResponse[list[UserResponse]])
async def admin_list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_admin),
):
    _ = current_user
    return ok(await list_users(limit=limit, skip=offset))
