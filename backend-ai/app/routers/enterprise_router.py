from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.api_key import APIKey
from app.models.remediation_log import RemediationLog
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.user import User, UserRoleEnum
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.enterprise_schema import (
    AuditLogEntryResponse,
    TeamInviteRequest,
    TeamMemberResponse,
    TeamRoleUpdateRequest,
    UsageSummaryResponse,
    UsageTrendPointResponse,
)
from app.services.auth_service import create_password_reset_token_for_user
from app.utils.hashing import get_password_hash

router = APIRouter(tags=["enterprise"])

TEAM_ROLE_TO_USER_ROLE = {
    "OWNER": UserRoleEnum.SUPER_ADMIN,
    "ADMIN": UserRoleEnum.ADMIN,
    "VIEWER": UserRoleEnum.VIEWER,
}

USER_ROLE_TO_TEAM_ROLE = {
    UserRoleEnum.SUPER_ADMIN: "OWNER",
    UserRoleEnum.ADMIN: "ADMIN",
    UserRoleEnum.ANALYST: "ADMIN",
    UserRoleEnum.VIEWER: "VIEWER",
}


def _display_name_from_email(email: str) -> str:
    local = (email or "workspace-member").split("@", 1)[0]
    parts = [part for part in local.replace("-", ".").replace("_", ".").split(".") if part]
    if not parts:
        return "Workspace Member"
    return " ".join(part[:1].upper() + part[1:] for part in parts)


def _workspace_identifier(current_user: User) -> str:
    if current_user.organization_name:
        return current_user.organization_name.strip().lower()
    if "@" in current_user.email:
        return current_user.email.split("@", 1)[1].strip().lower()
    return f"user-{current_user.id}"


def _ensure_workspace_identifier(db: Session, current_user: User) -> str:
    workspace_id = _workspace_identifier(current_user)
    if current_user.organization_name != workspace_id:
        current_user.organization_name = workspace_id
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    return workspace_id


def _workspace_users(db: Session, current_user: User) -> list[User]:
    workspace_id = _ensure_workspace_identifier(db, current_user)
    users = (
        db.query(User)
        .filter(User.organization_name == workspace_id)
        .order_by(User.created_at.asc(), User.id.asc())
        .all()
    )
    return users or [current_user]


def _utc_datetime(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _serialize_team_member(user: User, *, invite_link: str | None = None) -> TeamMemberResponse:
    return TeamMemberResponse(
        id=str(user.id),
        name=_display_name_from_email(user.email),
        email=user.email,
        role=USER_ROLE_TO_TEAM_ROLE.get(user.role, "VIEWER"),
        status="ACTIVE" if bool(user.is_active) else "PENDING",
        invite_link=invite_link,
    )


def _severity_for_log(log: SecurityLog) -> str:
    score = max(float(log.risk_score or 0), float(log.threat_score or 0))
    if log.status == LogStatusEnum.BLOCKED or bool(log.is_quarantined) or score >= 0.9:
        return "CRITICAL"
    if log.status == LogStatusEnum.REDACTED or score >= 0.5 or bool(log.threat_type):
        return "WARNING"
    return "INFO"


def _action_for_log(log: SecurityLog) -> str:
    if bool(log.is_quarantined):
        return "request.quarantined"
    if log.status == LogStatusEnum.BLOCKED:
        return "request.blocked"
    if log.status == LogStatusEnum.REDACTED:
        return "request.redacted"
    return "request.allowed"


def _resource_for_log(log: SecurityLog, key_name: str | None) -> str:
    if log.endpoint and key_name:
        return f"{log.endpoint} via {key_name}"
    if log.endpoint:
        return log.endpoint
    if key_name:
        return key_name
    return "Sentinel Gateway"


@router.get("/audit-logs", response_model=ApiResponse[list[AuditLogEntryResponse]])
def get_audit_logs(
    limit: int = Query(12, ge=1, le=100),
    offset: int = Query(0, ge=0),
    severity: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = _workspace_users(db, current_user)
    user_ids = [user.id for user in users]
    if not user_ids:
        return ok([])

    key_rows = db.query(APIKey.id, APIKey.name, APIKey.user_id).filter(APIKey.user_id.in_(user_ids)).all()
    key_ids = [row.id for row in key_rows]
    key_names = {row.id: row.name for row in key_rows}
    actor_emails = {user.id: user.email for user in users}
    key_owners = {row.id: actor_emails.get(row.user_id, current_user.email) for row in key_rows}

    events: list[AuditLogEntryResponse] = []
    if key_ids:
        logs = (
            db.query(SecurityLog)
            .filter(SecurityLog.api_key_id.in_(key_ids))
            .order_by(SecurityLog.timestamp.desc(), SecurityLog.id.desc())
            .all()
        )
        for log in logs:
            timestamp = _utc_datetime(log.timestamp)
            events.append(
                AuditLogEntryResponse(
                    id=f"log-{log.id}",
                    timestamp=timestamp,
                    actor=key_owners.get(log.api_key_id, current_user.email),
                    actor_type="USER",
                    action=_action_for_log(log),
                    resource=_resource_for_log(log, key_names.get(log.api_key_id)),
                    ip_address=log.ip_address,
                    severity=_severity_for_log(log),
                    old_value=None,
                    new_value={
                        "status": log.status.value if hasattr(log.status, "value") else str(log.status),
                        "threat_type": log.threat_type,
                        "risk_level": log.risk_level,
                        "is_quarantined": bool(log.is_quarantined),
                    },
                    metadata={
                        "api_key_id": log.api_key_id,
                        "request_id": log.request_id,
                        "model": log.model,
                        "method": log.method,
                        "tokens_used": log.tokens_used,
                        "latency_ms": log.latency_ms,
                        "threat_score": log.threat_score,
                        "risk_score": log.risk_score,
                        "attack_vector": log.attack_vector,
                    },
                )
            )

    remediations = (
        db.query(RemediationLog)
        .filter(RemediationLog.user_id.in_(user_ids))
        .order_by(RemediationLog.created_at.desc(), RemediationLog.id.desc())
        .all()
    )
    for remediation in remediations:
        timestamp = _utc_datetime(remediation.created_at)
        actor = actor_emails.get(remediation.user_id or current_user.id, current_user.email)
        outcome_failed = bool(remediation.error) or any(
            str(action.get("status", "")).upper() == "FAILED" for action in (remediation.actions or [])
        )
        severity_value = "CRITICAL" if float(remediation.threat_score or 0) >= 0.9 or outcome_failed else "WARNING"
        events.append(
            AuditLogEntryResponse(
                id=f"remediation-{remediation.id}",
                timestamp=timestamp,
                actor="Sentinel Automation",
                actor_type="SYSTEM",
                action="remediation.executed" if not outcome_failed else "remediation.failed",
                resource=remediation.request_id or remediation.threat_type or f"User {actor}",
                ip_address=None,
                severity=severity_value,
                old_value=None,
                new_value={"actions": remediation.actions or []},
                metadata={
                    "user_email": actor,
                    "api_key_id": remediation.api_key_id,
                    "request_id": remediation.request_id,
                    "threat_type": remediation.threat_type,
                    "threat_score": remediation.threat_score,
                    "email_to": remediation.email_to,
                    "webhook_urls": remediation.webhook_urls,
                    "error": remediation.error,
                },
            )
        )

    if start_date is not None:
        start_at = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        events = [event for event in events if event.timestamp >= start_at]
    if end_date is not None:
        end_at = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        events = [event for event in events if event.timestamp <= end_at]
    if severity:
        normalized_severity = severity.strip().upper()
        events = [event for event in events if event.severity == normalized_severity]

    events.sort(key=lambda event: (event.timestamp, event.id), reverse=True)
    return ok(events[offset: offset + limit])


@router.get("/usage", response_model=ApiResponse[UsageSummaryResponse])
def get_usage_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = _workspace_users(db, current_user)
    user_ids = [user.id for user in users]
    key_ids = [row.id for row in db.query(APIKey.id).filter(APIKey.user_id.in_(user_ids)).all()]

    trend_map: dict[str, dict[str, int]] = defaultdict(lambda: {"requests": 0, "threats": 0})
    blocked_injections = 0
    total_requests = 0
    now = datetime.now(timezone.utc)
    start_day = now.date() - timedelta(days=29)

    if key_ids:
        logs = (
            db.query(SecurityLog)
            .filter(SecurityLog.api_key_id.in_(key_ids))
            .order_by(SecurityLog.timestamp.asc(), SecurityLog.id.asc())
            .all()
        )
        total_requests = len(logs)
        for log in logs:
            timestamp = _utc_datetime(log.timestamp)
            day_key = timestamp.date().isoformat()
            trend_map[day_key]["requests"] += 1
            if log.status != LogStatusEnum.CLEAN:
                trend_map[day_key]["threats"] += 1
                blocked_injections += 1

    trend = [
        UsageTrendPointResponse(
            date=(start_day + timedelta(days=offset)).isoformat(),
            requests=trend_map[(start_day + timedelta(days=offset)).isoformat()]["requests"],
            threats=trend_map[(start_day + timedelta(days=offset)).isoformat()]["threats"],
        )
        for offset in range(30)
    ]

    quota_limit = sum(int(user.monthly_limit or 0) for user in users) or int(current_user.monthly_limit or 0) or 1000
    return ok(
        UsageSummaryResponse(
            total_requests=total_requests,
            blocked_injections=blocked_injections,
            monthly_credits_remaining=max(0, quota_limit - total_requests),
            quota={"used": total_requests, "limit": quota_limit},
            trend=trend,
            notify_at_80=None,
        )
    )


@router.get("/team", response_model=ApiResponse[list[TeamMemberResponse]])
def get_team_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = _workspace_users(db, current_user)
    members = [_serialize_team_member(user) for user in users]
    members.sort(key=lambda member: (member.status != "ACTIVE", member.email))
    return ok(members)


@router.post("/team/invite", response_model=ApiResponse[TeamMemberResponse])
def invite_team_member(
    payload: TeamInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = _ensure_workspace_identifier(db, current_user)
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    target_role = TEAM_ROLE_TO_USER_ROLE[payload.role]

    if existing:
        existing.organization_name = workspace_id
        existing.role = target_role
        if existing.id != current_user.id and not existing.is_active:
            existing.is_active = False
        invite_link = None
        if payload.generate_invite_link and not bool(existing.is_active):
            token = create_password_reset_token_for_user(existing)
            invite_link = f"/reset-password?token={token}"
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return ok(_serialize_team_member(existing, invite_link=invite_link))

    temp_password = f"{secrets.token_urlsafe(18)}Aa1!"
    invited = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(temp_password),
        organization_name=workspace_id,
        role=target_role,
        is_active=False,
        is_verified=False,
        tier=current_user.tier,
        monthly_limit=current_user.monthly_limit,
        password_updated_at=datetime.now(timezone.utc),
    )
    db.add(invited)
    invite_link = None
    if payload.generate_invite_link:
        token = create_password_reset_token_for_user(invited)
        invite_link = f"/reset-password?token={token}"
    db.commit()
    db.refresh(invited)
    return ok(_serialize_team_member(invited, invite_link=invite_link))


@router.patch("/team/{member_id}", response_model=ApiResponse[TeamMemberResponse])
def update_team_member_role(
    member_id: int,
    payload: TeamRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = _ensure_workspace_identifier(db, current_user)
    member = (
        db.query(User)
        .filter(User.id == member_id, User.organization_name == workspace_id)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

    member.role = TEAM_ROLE_TO_USER_ROLE[payload.role]
    db.add(member)
    db.commit()
    db.refresh(member)
    return ok(_serialize_team_member(member))


@router.delete("/team/{member_id}", response_model=ApiResponse[dict[str, bool]])
def remove_team_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = _ensure_workspace_identifier(db, current_user)
    member = (
        db.query(User)
        .filter(User.id == member_id, User.organization_name == workspace_id)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")
    if member.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own account")

    db.delete(member)
    db.commit()
    return ok({"deleted": True})
