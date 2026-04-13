from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import create_api_key_record, list_api_keys, revoke_api_key_record

router = APIRouter(tags=["keys"])


class CreateApiKeyRequest(BaseModel):
    name: str = Field(default="API Key", max_length=120)


@router.get("")
async def read_keys(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await list_api_keys(request, current_user))


@router.post("")
async def create_key(payload: CreateApiKeyRequest, request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await create_api_key_record(request, current_user, name=payload.name))


@router.delete("/{key_id}")
async def revoke_key(key_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    updated = await revoke_api_key_record(request, current_user, key_id=key_id)
    return ok(updated or {"id": key_id, "status": "REVOKED"})
