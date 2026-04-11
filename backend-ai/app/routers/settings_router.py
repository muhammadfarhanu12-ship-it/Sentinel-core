from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.settings_schema import UserSettingsResponse, UserSettingsUpdate


router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings(db: Session, user_id: int) -> UserSettings:
    settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if settings:
        return settings
    settings = UserSettings(user_id=user_id)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("", response_model=ApiResponse[UserSettingsResponse])
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db, current_user.id)
    return ok(UserSettingsResponse.model_validate(settings, from_attributes=True))


@router.put("", response_model=ApiResponse[UserSettingsResponse])
def update_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db, current_user.id)
    update = payload.model_dump(exclude_unset=True)
    for key, value in update.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return ok(UserSettingsResponse.model_validate(settings, from_attributes=True))

