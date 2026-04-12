from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.admin.admin_schema import (
    AdminAccessRequestCreate,
    AdminAccessRequestResponse,
    AdminApiKeyCreateRequest,
    AdminApiKeyResponse,
    AdminForgotPasswordRequest,
    AdminForgotPasswordResponse,
    AdminLoginRequest,
    AdminMessageResponse,
    AdminMetricsResponse,
    AdminResetPasswordRequest,
    AdminSecurityLogResponse,
    AdminSettingsResponse,
    AdminSettingsUpdateRequest,
    AdminSystemStatusResponse,
    AdminTokenResponse,
    AdminUserStatusUpdate,
    AdminUserSummary,
)
from app.admin.admin_service import AdminService
from app.core.database import get_db
from app.middleware.auth_middleware import get_current_admin
from app.schemas.api_schema import ApiResponse, ok

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> AdminService:
    return AdminService(db)


@router.get("/dashboard", response_model=ApiResponse[dict])
async def get_dashboard(
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_dashboard(current_admin))


@router.post("/login", response_model=ApiResponse[AdminTokenResponse])
@router.post("/auth/login", response_model=ApiResponse[AdminTokenResponse])
async def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.login(str(payload.email), payload.password, request))


@router.post("/forgot-password", response_model=ApiResponse[AdminForgotPasswordResponse])
async def forgot_password(
    payload: AdminForgotPasswordRequest,
    request: Request,
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.request_password_reset(str(payload.email), request))


@router.post("/reset-password", response_model=ApiResponse[AdminMessageResponse])
async def reset_password(
    payload: AdminResetPasswordRequest,
    request: Request,
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.reset_password(payload, request))


@router.post(
    "/request-access",
    response_model=ApiResponse[AdminAccessRequestResponse],
    status_code=status.HTTP_201_CREATED,
)
async def request_access(
    payload: AdminAccessRequestCreate,
    request: Request,
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.request_access(payload, request))


@router.get("/metrics", response_model=ApiResponse[AdminMetricsResponse])
async def get_metrics(
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_metrics(current_admin))


@router.get("/system-status", response_model=ApiResponse[AdminSystemStatusResponse])
async def get_system_status(
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_system_status(current_admin))


@router.get("/users", response_model=ApiResponse[list[AdminUserSummary]])
async def get_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    is_active: bool | None = Query(default=None),
    tier: str | None = Query(default=None, max_length=32),
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_users(current_admin, limit, offset, q, is_active, tier))


@router.delete("/users/{user_id}", response_model=ApiResponse[dict])
async def delete_user(
    user_id: str,
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.delete_user(current_admin, user_id))


@router.patch("/users/{user_id}/status", response_model=ApiResponse[AdminUserSummary])
async def update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.update_user_status(current_admin, user_id, payload))


@router.get("/logs", response_model=ApiResponse[list[AdminSecurityLogResponse]])
async def get_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=32),
    risk_level: str | None = Query(default=None, max_length=32),
    threat_type: str | None = Query(default=None, max_length=120),
    only_quarantined: bool | None = Query(default=None),
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_logs(current_admin, limit, offset, q, status, risk_level, threat_type, only_quarantined))


@router.get("/threats", response_model=ApiResponse[list[AdminSecurityLogResponse]])
async def get_threats(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=32),
    risk_level: str | None = Query(default=None, max_length=32),
    threat_type: str | None = Query(default=None, max_length=120),
    only_quarantined: bool | None = Query(default=None),
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_threats(current_admin, limit, offset, q, status, risk_level, threat_type, only_quarantined))


@router.get("/api-keys", response_model=ApiResponse[list[AdminApiKeyResponse]])
async def get_api_keys(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=32),
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.list_api_keys(current_admin, limit, offset, q, status))


@router.post("/api-keys", response_model=ApiResponse[AdminApiKeyResponse])
async def create_api_key(
    payload: AdminApiKeyCreateRequest,
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.create_gateway_api_key(current_admin, payload))


@router.delete("/api-keys/{key_id}", response_model=ApiResponse[AdminApiKeyResponse])
async def delete_api_key(
    key_id: str,
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.revoke_gateway_api_key(current_admin, key_id))


@router.get("/settings", response_model=ApiResponse[AdminSettingsResponse])
async def get_settings(
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.get_settings(current_admin))


@router.put("/settings", response_model=ApiResponse[AdminSettingsResponse])
async def update_settings(
    payload: AdminSettingsUpdateRequest,
    current_admin: dict = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
):
    return ok(await service.update_settings(current_admin, payload))
