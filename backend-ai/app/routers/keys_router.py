from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.schemas.api_key_schema import APIKeyCreate, APIKeyCreateResponse, APIKeyResponse
from app.schemas.api_schema import ApiResponse, ok
from app.services.api_key_service import create_api_key, get_user_api_keys, revoke_api_key


# Compatibility router: frontend expects `/api/v1/keys` (and legacy `/api/keys`).
router = APIRouter(prefix="/keys", tags=["api-keys"])


@router.post("", response_model=ApiResponse[APIKeyCreateResponse])
def create_key(key_in: APIKeyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_key, raw_key = create_api_key(db, current_user.id, key_in)
    return ok(
        {
            "id": db_key.id,
            "name": db_key.name,
            "status": db_key.status,
            "usage_count": db_key.usage_count,
            "created_at": db_key.created_at,
            "key": raw_key,
        }
    )


@router.get("", response_model=ApiResponse[List[APIKeyResponse]])
def get_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(get_user_api_keys(db, current_user.id))


@router.delete("/{key_id}", response_model=ApiResponse[APIKeyResponse])
def delete_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(revoke_api_key(db, current_user.id, key_id))

