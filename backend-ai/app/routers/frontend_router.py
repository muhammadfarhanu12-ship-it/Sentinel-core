from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.api_key_schema import APIKeyCreate, APIKeyCreateResponse
from app.services.api_key_service import create_api_key, get_user_api_keys, revoke_api_key
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(tags=["frontend-compat"])


def _serialize_key(db_key, raw_key: str | None = None):
    prefix = getattr(db_key, "prefix", None) or settings.API_KEY_MASK
    masked_key = raw_key or f"{prefix}{'*' * 28}"
    return {
        "id": str(db_key.id),
        "name": db_key.name,
        "status": str(db_key.status.value).lower(),
        "usage_count": db_key.usage_count,
        "created_at": db_key.created_at,
        "last_used": getattr(db_key, "last_used", None),
        "key": masked_key,
    }


@router.get("/keys", response_model=ApiResponse[List[dict]])
def get_keys_compat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ok([_serialize_key(db_key) for db_key in get_user_api_keys(db, current_user.id)])


@router.post("/keys", response_model=ApiResponse[dict])
def create_key_compat(
    key_in: APIKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_key, raw_key = create_api_key(db, current_user.id, key_in)
    return ok(_serialize_key(db_key, raw_key=raw_key))


@router.delete("/keys/{key_id}", response_model=ApiResponse[dict])
def delete_key_compat(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_key = revoke_api_key(db, current_user.id, key_id)
    return ok(_serialize_key(db_key))
