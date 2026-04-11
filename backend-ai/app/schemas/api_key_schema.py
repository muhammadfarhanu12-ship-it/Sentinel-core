from pydantic import BaseModel
from datetime import datetime
from app.models.api_key import KeyStatusEnum

class APIKeyCreate(BaseModel):
    name: str

class APIKeyResponse(BaseModel):
    id: int
    name: str
    status: KeyStatusEnum
    usage_count: int
    created_at: datetime
    last_used: datetime | None = None
    last_ip: str | None = None

    class Config:
        from_attributes = True

class APIKeyCreateResponse(APIKeyResponse):
    key: str # Only returned once on creation
