from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification_schema import NotificationCreate, NotificationResponse
from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ApiResponse, ok
from app.routers.notification_ws import schedule_notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("", response_model=ApiResponse[List[NotificationResponse]])
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(200)
        .all()
    )
    return ok(items)

@router.post("", response_model=ApiResponse[NotificationResponse])
def create_notification(payload: NotificationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only allow self-scoped creation from the UI/API.
    item = Notification(
        user_id=current_user.id,
        title=payload.title,
        message=payload.message,
        type=payload.type or "info",
        is_read=False,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    try:
        schedule_notification(NotificationResponse.model_validate(item, from_attributes=True).model_dump(mode="json"))
    except Exception:
        pass
    return ok(item)


@router.post("/{notification_id}/read", response_model=ApiResponse[NotificationResponse])
def mark_as_read(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notification = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return ok(notification)

@router.post("/read-all")
def mark_all_as_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return ok({"status": "success"})
