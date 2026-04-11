from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr


TeamRoleValue = Literal["OWNER", "ADMIN", "VIEWER"]


class AuditLogEntryResponse(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    actor_type: str
    action: str
    resource: str
    ip_address: str | None = None
    severity: str
    old_value: Any | None = None
    new_value: Any | None = None
    metadata: dict[str, Any] | None = None


class UsageTrendPointResponse(BaseModel):
    date: str
    requests: int
    threats: int


class UsageQuotaResponse(BaseModel):
    used: int
    limit: int


class UsageSummaryResponse(BaseModel):
    total_requests: int
    blocked_injections: int
    monthly_credits_remaining: int
    quota: UsageQuotaResponse
    trend: list[UsageTrendPointResponse]
    notify_at_80: bool | None = None


class TeamMemberResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: TeamRoleValue
    status: str
    invite_link: str | None = None


class TeamInviteRequest(BaseModel):
    email: EmailStr
    role: TeamRoleValue = "VIEWER"
    generate_invite_link: bool = True


class TeamRoleUpdateRequest(BaseModel):
    role: TeamRoleValue

