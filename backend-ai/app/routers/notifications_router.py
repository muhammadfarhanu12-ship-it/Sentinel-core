from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import (
    create_notification_record,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)

router = APIRouter(tags=["notifications"])


class CreateNotificationRequest(BaseModel):
    title: str = Field(..., max_length=200)
    message: str = Field(..., max_length=2000)
    type: str | None = Field(default="INFO", max_length=64)


@router.get("")
async def read_notifications(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await list_notifications(request, current_user))


@router.post("")
async def create_notification(payload: CreateNotificationRequest, request: Request, current_user: dict = Depends(get_current_user)):
    return ok(
        await create_notification_record(
            request,
            current_user,
            title=payload.title,
            message=payload.message,
            notification_type=payload.type,
        )
    )


@router.post("/{notification_id}/read")
async def read_notification(notification_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    updated = await mark_notification_read(request, current_user, notification_id=notification_id)
    return ok(updated or {"id": notification_id, "is_read": True})


@router.post("/read-all")
async def read_all_notifications(request: Request, current_user: dict = Depends(get_current_user)):
    return ok({"updated": await mark_all_notifications_read(request, current_user)})
