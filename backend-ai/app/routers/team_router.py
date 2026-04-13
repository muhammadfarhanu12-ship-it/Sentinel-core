from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import (
    invite_team_member_record,
    list_team_members,
    remove_team_member_record,
    update_team_member_role_record,
)

router = APIRouter(tags=["team"])


class TeamInviteRequest(BaseModel):
    email: str
    role: str = Field(default="VIEWER", max_length=32)
    generate_invite_link: bool = True


class TeamUpdateRequest(BaseModel):
    role: str = Field(..., max_length=32)


@router.get("")
async def read_team(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await list_team_members(request, current_user))


@router.post("/invite")
async def invite_team_member(payload: TeamInviteRequest, request: Request, current_user: dict = Depends(get_current_user)):
    return ok(
        await invite_team_member_record(
            request,
            current_user,
            email=str(payload.email),
            role=payload.role,
            generate_invite_link=payload.generate_invite_link,
        )
    )


@router.patch("/{member_id}")
async def update_team_member(member_id: int, payload: TeamUpdateRequest, request: Request, current_user: dict = Depends(get_current_user)):
    updated = await update_team_member_role_record(request, current_user, member_id=member_id, role=payload.role)
    return ok(updated or {"id": member_id, "role": payload.role.upper(), "status": "PENDING"})


@router.delete("/{member_id}")
async def remove_team_member(member_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    deleted = await remove_team_member_record(request, current_user, member_id=member_id)
    return ok({"deleted": deleted, "id": member_id})
