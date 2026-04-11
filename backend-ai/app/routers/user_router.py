from fastapi import APIRouter, Depends
from app.schemas.user_schema import UserResponse
from app.models.user import User
from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=ApiResponse[UserResponse])
def read_users_me(current_user: User = Depends(get_current_user)):
    return ok(current_user)
