from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.admin.admin_schema import (
    AdminApiKeyCreateRequest,
    AdminApiKeyResponse,
    AdminMetricsResponse,
    AdminSecurityLogResponse,
    AdminSettingsResponse,
    AdminSettingsUpdateRequest,
    AdminSystemStatusResponse,
    AdminUserStatusUpdate,
    AdminUserSummary,
)
from app.admin.admin_service import AdminService
from app.core.database import get_db
from app.dependencies.auth import get_admin_user
from app.models.user_model import user_model
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.user_schema import UserResponse

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


def get_admin_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> AdminService:
    return AdminService(db)


@router.get("/dashboard", response_model=ApiResponse[dict])
async def get_dashboard(
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    payload = await service.get_dashboard(admin)
    payload.setdefault("user", UserResponse.model_validate(user_model(admin)).model_dump(mode="json"))
    return ok(payload)


@router.get("/stats", response_model=ApiResponse[AdminMetricsResponse])
@router.get("/metrics", response_model=ApiResponse[AdminMetricsResponse], include_in_schema=False)
async def get_stats(
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_metrics(admin))


@router.get("/system-status", response_model=ApiResponse[AdminSystemStatusResponse])
async def get_system_status(
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_system_status(admin))


@router.get("/users", response_model=ApiResponse[list[AdminUserSummary]])
async def get_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    is_active: bool | None = Query(default=None),
    tier: str | None = Query(default=None, max_length=32),
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_users(admin, limit, offset, q, is_active, tier))


@router.delete("/users/{user_id}", response_model=ApiResponse[dict])
async def delete_user(
    user_id: str,
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.delete_user(admin, user_id))


@router.patch("/users/{user_id}/status", response_model=ApiResponse[AdminUserSummary])
async def update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.update_user_status(admin, user_id, payload))


@router.get("/logs", response_model=ApiResponse[list[AdminSecurityLogResponse]])
async def get_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    risk_level: str | None = Query(default=None, max_length=32),
    threat_type: str | None = Query(default=None, max_length=120),
    only_quarantined: bool | None = Query(default=None),
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_logs(admin, limit, offset, q, status_filter, risk_level, threat_type, only_quarantined))


@router.get("/threats", response_model=ApiResponse[list[AdminSecurityLogResponse]])
async def get_threats(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    risk_level: str | None = Query(default=None, max_length=32),
    threat_type: str | None = Query(default=None, max_length=120),
    only_quarantined: bool | None = Query(default=None),
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_threats(admin, limit, offset, q, status_filter, risk_level, threat_type, only_quarantined))


@router.get("/api-keys", response_model=ApiResponse[list[AdminApiKeyResponse]])
async def get_api_keys(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_api_keys(admin, limit, offset, q, status_filter))


@router.post("/api-keys", response_model=ApiResponse[AdminApiKeyResponse])
async def create_api_key(
    payload: AdminApiKeyCreateRequest,
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.create_gateway_api_key(admin, payload))


@router.delete("/api-keys/{key_id}", response_model=ApiResponse[AdminApiKeyResponse])
async def delete_api_key(
    key_id: str,
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.revoke_gateway_api_key(admin, key_id))


@router.get("/settings", response_model=ApiResponse[AdminSettingsResponse])
async def get_settings(
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_settings(admin))


@router.put("/settings", response_model=ApiResponse[AdminSettingsResponse])
async def update_settings(
    payload: AdminSettingsUpdateRequest,
    admin=Depends(get_admin_user),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.update_settings(admin, payload))
