from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.admin.admin_schema import (
    AdminAccessRequestCreate,
    AdminAccessRequestResponse,
    AdminApiKeyCreateRequest,
    AdminApiKeyResponse,
    AdminForgotPasswordResponse,
    AdminMessageResponse,
    AdminMetricsResponse,
    AdminMetricsSeriesPoint,
    AdminResetPasswordRequest,
    AdminSecurityLogResponse,
    AdminSettingsResponse,
    AdminSettingsUpdateRequest,
    AdminSystemStatusResponse,
    AdminTokenResponse,
    AdminUserStatusUpdate,
    AdminUserSummary,
)
from app.middleware.rate_limiter import check_rate_limit
from app.security.roles import ADMIN_ROLE, is_admin_role
from app.services import admin_login_notification_service
from app.services.dashboard_service import record_audit_event
from app.utils.api_key_generator import generate_api_key
from app.utils.hashing import get_password_hash, verify_password
from app.utils.token_generator import create_access_token

logger = logging.getLogger(__name__)
_ADMIN_LOGIN_FAILURE_ALERT_THRESHOLD = 5
_ADMIN_LOGIN_ATTEMPTS_COLLECTION = "admin_login_attempts"


class AdminService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _normalize_email(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _hash_token(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    @staticmethod
    def _get_user_agent(request: Request) -> str | None:
        user_agent = request.headers.get("user-agent")
        return user_agent.strip() if isinstance(user_agent, str) and user_agent.strip() else None

    @staticmethod
    def _build_login_attempt_keys(normalized_email: str, ip_address: str) -> list[tuple[str, str]]:
        keys: list[tuple[str, str]] = []
        if normalized_email:
            keys.append(("email", normalized_email))
        if ip_address and all(existing_identifier != ip_address for _, existing_identifier in keys):
            keys.append(("ip", ip_address))
        return keys

    @staticmethod
    def _parse_object_id(value: str) -> ObjectId:
        try:
            return ObjectId(value)
        except (InvalidId, TypeError) as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found") from exc

    @staticmethod
    def _numeric_identifier(value: str | int | None) -> int | None:
        try:
            if value is None:
                return None
            return int(str(value).strip())
        except (TypeError, ValueError):
            return None

    async def _find_user_by_identifier(self, user_id: str | int) -> dict[str, Any] | None:
        raw_value = str(user_id).strip()
        if ObjectId.is_valid(raw_value):
            user = await self.db["users"].find_one({"_id": ObjectId(raw_value)})
            if user is not None:
                return user
        return await self.db["users"].find_one({"id": raw_value})

    async def _find_key_by_identifier(self, key_id: str | int) -> dict[str, Any] | None:
        raw_value = str(key_id).strip()
        numeric_value = self._numeric_identifier(key_id)
        clauses: list[dict[str, Any]] = []
        if numeric_value is not None:
            clauses.extend([{"id": numeric_value}, {"id": str(numeric_value)}])
        if ObjectId.is_valid(raw_value):
            clauses.append({"_id": ObjectId(raw_value)})
        if not clauses:
            return None
        return await self.db["keys"].find_one({"$or": clauses})

    async def _record_failed_login_attempt(
        self,
        *,
        normalized_email: str,
        ip_address: str,
        user_agent: str | None,
    ) -> int:
        attempts_collection = self.db[_ADMIN_LOGIN_ATTEMPTS_COLLECTION]
        now = self._utcnow()
        highest_attempt_count = 0
        alert_updates: list[tuple[Any, int]] = []

        for scope, identifier in self._build_login_attempt_keys(normalized_email, ip_address):
            lookup_key = f"{scope}:{identifier}"
            existing = await attempts_collection.find_one({"key": lookup_key})
            current_count = int(existing.get("count") or 0) + 1 if existing else 1
            highest_attempt_count = max(highest_attempt_count, current_count)
            last_alert_count = int(existing.get("last_alert_count") or 0) if existing else 0
            update_payload = {
                "key": lookup_key,
                "scope": scope,
                "identifier": identifier,
                "attempted_email": normalized_email,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "count": current_count,
                "first_failed_at": existing.get("first_failed_at") if existing else now,
                "last_failed_at": now,
                "updated_at": now,
            }

            if existing is None:
                insert_result = await attempts_collection.insert_one(
                    {
                        **update_payload,
                        "created_at": now,
                        "last_alert_count": 0,
                    }
                )
                record_id = insert_result.inserted_id
            else:
                await attempts_collection.update_one({"_id": existing["_id"]}, {"$set": update_payload})
                record_id = existing["_id"]

            if current_count >= _ADMIN_LOGIN_FAILURE_ALERT_THRESHOLD and current_count >= last_alert_count + _ADMIN_LOGIN_FAILURE_ALERT_THRESHOLD:
                alert_updates.append((record_id, current_count))

        if alert_updates:
            result = await admin_login_notification_service.send_admin_login_failed_attempt_alert_async(
                attempted_email=normalized_email,
                attempt_count=highest_attempt_count,
                attempted_at=now,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            if result.success:
                for record_id, alert_count in alert_updates:
                    await attempts_collection.update_one(
                        {"_id": record_id},
                        {"$set": {"last_alert_count": alert_count, "updated_at": now}},
                    )
            else:
                logger.warning(
                    "Failed to send admin failed-login alert email email=%s ip=%s error=%s",
                    normalized_email,
                    ip_address,
                    result.error,
                )

        return highest_attempt_count

    async def _reset_failed_login_attempts(self, *, normalized_email: str, ip_address: str) -> None:
        attempts_collection = self.db[_ADMIN_LOGIN_ATTEMPTS_COLLECTION]
        for scope, identifier in self._build_login_attempt_keys(normalized_email, ip_address):
            await attempts_collection.delete_one({"key": f"{scope}:{identifier}"})

    async def _capture_failed_login_attempt(
        self,
        *,
        normalized_email: str,
        ip_address: str,
        user_agent: str | None,
    ) -> None:
        try:
            await self._record_failed_login_attempt(
                normalized_email=normalized_email,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            logger.exception("Failed to record admin login attempt email=%s ip=%s", normalized_email, ip_address)

    async def _send_success_login_notification(
        self,
        *,
        admin_email: str,
        login_at: datetime,
        ip_address: str,
        user_agent: str | None,
    ) -> None:
        result = await admin_login_notification_service.send_admin_login_success_email_async(
            admin_email=admin_email,
            login_at=login_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        if not result.success:
            logger.warning(
                "Failed to send admin login activity email email=%s ip=%s error=%s",
                admin_email,
                ip_address,
                result.error,
            )

    async def _get_user_or_404(self, user_id: str) -> dict[str, Any]:
        user = await self._find_user_by_identifier(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    @staticmethod
    def _audit_actor_from_admin(admin: dict[str, Any] | None, *, fallback_email: str | None = None) -> dict[str, Any]:
        email = str((admin or {}).get("email") or fallback_email or "admin@sentinel.local").strip().lower()
        organization_name = str((admin or {}).get("organization_name") or "").strip()
        if not organization_name:
            organization_name = email.split("@", 1)[1] if "@" in email else "sentinel.local"
        return {
            "id": str((admin or {}).get("_id") or (admin or {}).get("id") or email),
            "_id": str((admin or {}).get("_id") or (admin or {}).get("id") or email),
            "email": email,
            "organization_name": organization_name,
            "tier": str((admin or {}).get("tier") or "BUSINESS"),
            "role": ADMIN_ROLE,
            "is_admin": True,
            "is_active": True,
            "is_verified": True,
            "monthly_limit": 0,
        }

    async def _record_admin_audit(
        self,
        request: Request,
        *,
        action: str,
        admin: dict[str, Any] | None = None,
        fallback_email: str | None = None,
        severity: str = "INFO",
        resource: str = "admin",
        metadata: dict[str, Any] | None = None,
        new_value: Any = None,
    ) -> None:
        try:
            await record_audit_event(
                request,
                current_user=self._audit_actor_from_admin(admin, fallback_email=fallback_email),
                action=action,
                resource=resource,
                severity=severity,
                metadata={
                    "request_id": getattr(request.state, "request_id", None),
                    "ip_address": self._get_client_ip(request),
                    **(metadata or {}),
                },
                new_value=new_value,
            )
        except Exception:
            logger.exception("Failed to persist admin audit action=%s", action)

    async def login(self, email: str, password: str, request: Request) -> AdminTokenResponse:
        normalized_email = self._normalize_email(email)
        ip_address = self._get_client_ip(request)
        user_agent = self._get_user_agent(request)
        check_rate_limit(
            f"admin-login:{ip_address or normalized_email}",
            scope="admin-login",
            limit=5,
            window_seconds=60,
        )

        user = await self.db["users"].find_one({"email": normalized_email})
        if user is None or not verify_password(password, str(user.get("hashed_password", ""))):
            await self._capture_failed_login_attempt(
                normalized_email=normalized_email,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._record_admin_audit(
                request,
                action="admin_login_failure",
                fallback_email=normalized_email,
                severity="WARNING",
                metadata={"reason": "invalid_credentials"},
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")
        if not bool(user.get("is_active", True)):
            await self._capture_failed_login_attempt(
                normalized_email=normalized_email,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._record_admin_audit(
                request,
                action="admin_login_failure",
                admin=user,
                severity="WARNING",
                metadata={"reason": "inactive_admin"},
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account is inactive")
        if not is_admin_role(user.get("role")):
            await self._capture_failed_login_attempt(
                normalized_email=normalized_email,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._record_admin_audit(
                request,
                action="admin_login_failure",
                admin=user,
                severity="WARNING",
                metadata={"reason": "admin_access_required"},
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        now = self._utcnow()
        await self.db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": now, "updated_at": now, "role": ADMIN_ROLE}},
        )
        try:
            await self._reset_failed_login_attempts(normalized_email=normalized_email, ip_address=ip_address)
        except Exception:
            logger.exception("Failed to reset admin login attempts email=%s ip=%s", normalized_email, ip_address)
        try:
            await self._send_success_login_notification(
                admin_email=normalized_email,
                login_at=now,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            logger.exception("Failed to send admin login activity email email=%s ip=%s", normalized_email, ip_address)

        access_token = create_access_token(
            data={
                "sub": normalized_email,
                "user_id": str(user["_id"]),
                "role": ADMIN_ROLE,
            }
        )
        await self._record_admin_audit(
            request,
            action="admin_login_success",
            admin=user,
            severity="INFO",
            metadata={"user_agent": user_agent},
        )
        return AdminTokenResponse(access_token=access_token, role=ADMIN_ROLE)

    async def get_dashboard(self, admin: dict[str, Any]) -> dict[str, object]:
        return {
            "message": "Welcome Admin",
            "admin": {
                "id": str(admin.get("_id") or admin.get("id")),
                "email": str(admin.get("email", "")).lower(),
                "role": ADMIN_ROLE,
                "is_active": bool(admin.get("is_active", True)),
                "last_login_at": admin.get("last_login_at"),
            },
        }

    async def request_password_reset(self, email: str, request: Request) -> AdminForgotPasswordResponse:
        normalized_email = self._normalize_email(email)
        check_rate_limit(
            f"admin-forgot-password:{self._get_client_ip(request) or normalized_email}",
            scope="admin-forgot-password",
            limit=3,
            window_seconds=900,
        )

        user = await self.db["users"].find_one({"email": normalized_email})
        if user is None or not is_admin_role(user.get("role")) or not bool(user.get("is_active", True)):
            return AdminForgotPasswordResponse(
                message="If an admin account exists, password reset instructions have been generated."
            )

        raw_token = secrets.token_urlsafe(32)
        expires_at = self._utcnow() + timedelta(minutes=30)
        await self.db["users"].update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "admin_reset_token_hash": self._hash_token(raw_token),
                    "admin_reset_token_expiry": expires_at,
                    "updated_at": self._utcnow(),
                }
            },
        )
        return AdminForgotPasswordResponse(
            message="If an admin account exists, password reset instructions have been generated.",
            email_sent=False,
            reset_token=raw_token,
            expires_at=expires_at,
        )

    async def reset_password(self, payload: AdminResetPasswordRequest, request: Request) -> AdminMessageResponse:
        check_rate_limit(
            f"admin-reset-password:{self._get_client_ip(request) or 'unknown'}",
            scope="admin-reset-password",
            limit=10,
            window_seconds=900,
        )

        now = self._utcnow()
        user = await self.db["users"].find_one({"admin_reset_token_hash": self._hash_token(payload.token)})
        if user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired admin reset token")

        expiry = user.get("admin_reset_token_expiry")
        if not isinstance(expiry, datetime):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired admin reset token")
        expiry = expiry if expiry.tzinfo else expiry.replace(tzinfo=timezone.utc)
        if expiry < now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired admin reset token")

        await self.db["users"].update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "hashed_password": get_password_hash(payload.new_password),
                    "admin_reset_token_hash": None,
                    "admin_reset_token_expiry": None,
                    "is_active": True,
                    "updated_at": now,
                }
            },
        )
        return AdminMessageResponse(message="Admin password reset completed successfully.")

    async def request_access(self, payload: AdminAccessRequestCreate, request: Request) -> AdminAccessRequestResponse:
        normalized_email = self._normalize_email(str(payload.email))
        check_rate_limit(
            f"admin-request-access:{self._get_client_ip(request) or normalized_email}",
            scope="admin-request-access",
            limit=3,
            window_seconds=3600,
        )

        existing_admin = await self.db["users"].find_one({"email": normalized_email, "role": ADMIN_ROLE})
        if existing_admin:
            return AdminAccessRequestResponse(
                message="An admin account already exists for this email. Use admin login or password recovery.",
                status="existing_account",
            )

        now = self._utcnow()
        result = await self.db["admin_access_requests"].insert_one(
            {
                "email": normalized_email,
                "full_name": payload.full_name,
                "organization_name": payload.organization_name,
                "reason": payload.reason,
                "status": "pending",
                "created_at": now,
                "updated_at": now,
            }
        )
        return AdminAccessRequestResponse(
            message="Admin access request submitted successfully.",
            request_id=str(result.inserted_id),
            status="pending",
        )

    async def get_metrics(self, admin: dict[str, Any]) -> AdminMetricsResponse:
        _ = admin

        total_users = await self.db["users"].count_documents({})
        active_users = await self.db["users"].count_documents({"is_active": True})
        suspended_users = max(0, total_users - active_users)
        total_requests = await self.db["logs"].count_documents({})
        threats_blocked = await self.db["logs"].count_documents(
            {
                "$or": [
                    {"status": {"$in": ["BLOCKED", "REDACTED"]}},
                    {"is_quarantined": True},
                ]
            }
        )
        active_api_keys = await self.db["keys"].count_documents({"status": {"$in": ["ACTIVE", "active"]}})
        quarantined_api_keys = await self.db["keys"].count_documents({"status": {"$in": ["QUARANTINED", "quarantined"]}})

        avg_latency_result = await self.db["logs"].aggregate(
            [{"$group": {"_id": None, "avg": {"$avg": "$latency_ms"}}}]
        ).to_list(length=1)
        avg_latency_ms = float(avg_latency_result[0]["avg"]) if avg_latency_result else 0.0

        start = self._utcnow() - timedelta(days=7)
        series_rows = await self.db["logs"].aggregate(
            [
                {"$match": {"timestamp": {"$gte": start}}},
                {
                    "$group": {
                        "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                        "requests": {"$sum": 1},
                        "threats": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$or": [
                                            {"$in": ["$status", ["BLOCKED", "REDACTED"]]},
                                            {"$eq": ["$is_quarantined", True]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                    }
                },
                {"$sort": {"_id": 1}},
            ]
        ).to_list(length=8)
        points = [
            AdminMetricsSeriesPoint(label=str(row.get("_id", "")), requests=int(row.get("requests", 0)), threats=int(row.get("threats", 0)))
            for row in series_rows
        ]

        recent_logs = await self.db["logs"].find(
            {},
            projection={
                "timestamp": 1,
                "status": 1,
                "threat_type": 1,
                "severity": 1,
                "request_id": 1,
                "attack_signature": 1,
                "policy_matches": 1,
                "tool_interception": 1,
                "output_findings": 1,
                "user_email": 1,
                "user_id": 1,
                "risk_score": 1,
            },
        ).sort("timestamp", -1).limit(1000).to_list(length=1000)

        policy_trigger_counts: dict[str, int] = {}
        severity_counts: dict[str, int] = {}
        signature_counts: dict[str, int] = {}
        threat_activity_feed: list[dict[str, Any]] = []
        tool_interception_total = 0
        tool_interception_intercepted = 0
        tool_interception_requires_2fa = 0
        leak_findings = 0
        leak_blocked = 0
        leak_redacted = 0
        user_risk_state: dict[str, dict[str, float]] = {}

        for row in recent_logs:
            severity = str(row.get("severity") or "LOW").upper()
            severity_counts[severity] = int(severity_counts.get(severity, 0)) + 1

            signature = str(row.get("attack_signature") or row.get("threat_type") or "NONE")
            signature_counts[signature] = int(signature_counts.get(signature, 0)) + 1

            for policy in (row.get("policy_matches") or []):
                if not isinstance(policy, dict):
                    continue
                policy_name = str(policy.get("policy_name") or "").strip()
                if not policy_name:
                    continue
                policy_trigger_counts[policy_name] = int(policy_trigger_counts.get(policy_name, 0)) + 1

            tool_interception = row.get("tool_interception") if isinstance(row.get("tool_interception"), dict) else {}
            if bool(tool_interception.get("tool_present")):
                tool_interception_total += 1
                if bool(tool_interception.get("requires_2fa")):
                    tool_interception_requires_2fa += 1
                if bool(tool_interception.get("intercepted")):
                    tool_interception_intercepted += 1

            output_findings = row.get("output_findings") if isinstance(row.get("output_findings"), list) else []
            if output_findings:
                leak_findings += len(output_findings)
                actions = {
                    str(item.get("action") or "").upper()
                    for item in output_findings
                    if isinstance(item, dict)
                }
                if "BLOCK" in actions:
                    leak_blocked += 1
                if "REDACT" in actions:
                    leak_redacted += 1

            user_key = str(row.get("user_email") or row.get("user_id") or "unknown")
            risk_value = float(row.get("risk_score") or 0.0)
            state = user_risk_state.setdefault(user_key, {"score": 0.0, "count": 0.0})
            state["score"] += risk_value
            state["count"] += 1

            status = str(row.get("status") or "").upper()
            if status in {"BLOCKED", "REDACTED"}:
                threat_activity_feed.append(
                    {
                        "timestamp": row.get("timestamp"),
                        "status": status,
                        "threat_type": str(row.get("threat_type") or "NONE"),
                        "severity": severity,
                        "request_id": str(row.get("request_id") or ""),
                        "attack_signature": signature,
                    }
                )

        attack_severity_chart = [{"severity": key, "count": value} for key, value in sorted(severity_counts.items(), key=lambda item: item[0])]
        top_attack_signatures = [
            {"signature": item[0], "count": item[1]}
            for item in sorted(signature_counts.items(), key=lambda entry: entry[1], reverse=True)[:8]
        ]
        user_risk_heatmap = [
            {
                "user": user_key,
                "average_risk_score": round((values["score"] / max(values["count"], 1.0)), 2),
                "events": int(values["count"]),
            }
            for user_key, values in user_risk_state.items()
        ]
        user_risk_heatmap.sort(key=lambda item: item["average_risk_score"], reverse=True)

        return AdminMetricsResponse(
            total_users=int(total_users),
            active_users=int(active_users),
            suspended_users=int(suspended_users),
            total_requests=int(total_requests),
            threats_blocked=int(threats_blocked),
            active_api_keys=int(active_api_keys),
            quarantined_api_keys=int(quarantined_api_keys),
            avg_latency_ms=round(avg_latency_ms, 2),
            requests_last_7_days=points,
            threat_activity_feed=threat_activity_feed[:25],
            policy_trigger_counts=policy_trigger_counts,
            attack_severity_chart=attack_severity_chart,
            tool_interception_metrics={
                "totalToolCalls": tool_interception_total,
                "requires2FA": tool_interception_requires_2fa,
                "intercepted": tool_interception_intercepted,
                "approved": max(tool_interception_total - tool_interception_intercepted, 0),
            },
            leak_prevention_metrics={
                "findings": leak_findings,
                "blockedEvents": leak_blocked,
                "redactedEvents": leak_redacted,
            },
            top_attack_signatures=top_attack_signatures,
            user_risk_heatmap=user_risk_heatmap[:20],
        )

    async def get_system_status(self, admin: dict[str, Any]) -> AdminSystemStatusResponse:
        _ = admin
        database_status = "ok"
        try:
            await self.db.command("ping")
        except Exception:
            database_status = "error"

        latest_event = await self.db["logs"].find_one(sort=[("timestamp", -1)], projection={"timestamp": 1})
        admin_count = await self.db["users"].count_documents({"role": ADMIN_ROLE})

        return AdminSystemStatusResponse(
            status="ok" if database_status == "ok" else "degraded",
            database=database_status,
            uptime_hint="Gateway operational",
            admin_count=int(admin_count),
            last_security_event_at=latest_event.get("timestamp") if latest_event else None,
        )

    async def list_audit_events(
        self,
        admin: dict[str, Any],
        limit: int,
        offset: int,
        q: str | None,
        severity: str | None,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[dict[str, Any]]:
        _ = admin
        query: dict[str, Any] = {}
        if q:
            safe_pattern = q.strip()
            query["$or"] = [
                {"actor": {"$regex": safe_pattern, "$options": "i"}},
                {"action": {"$regex": safe_pattern, "$options": "i"}},
                {"resource": {"$regex": safe_pattern, "$options": "i"}},
                {"event_type": {"$regex": safe_pattern, "$options": "i"}},
            ]
        if severity:
            query["severity"] = str(severity).upper()
        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date

        cursor = self.db["audit_logs"].find(query).sort("timestamp", -1).skip(offset).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [
            {
                "id": str(item.get("id") or item.get("_id")),
                "timestamp": item.get("timestamp"),
                "actor": item.get("actor"),
                "actor_type": item.get("actor_type"),
                "action": item.get("action"),
                "event_type": item.get("event_type") or item.get("action"),
                "resource": item.get("resource"),
                "severity": item.get("severity"),
                "ip_address": item.get("ip_address"),
                "request_id": item.get("request_id"),
                "decision": item.get("decision"),
                "risk_score": item.get("risk_score"),
                "matched_policies": item.get("matched_policies") or [],
                "provider": item.get("provider"),
                "model": item.get("model"),
                "prompt_preview": item.get("prompt_preview"),
                "metadata": item.get("metadata"),
                "old_value": item.get("old_value"),
                "new_value": item.get("new_value"),
            }
            for item in documents
        ]

    async def get_report_summary(self, admin: dict[str, Any]) -> dict[str, Any]:
        _ = admin
        logs = await self.db["logs"].find({}, projection={
            "timestamp": 1,
            "status": 1,
            "threat_type": 1,
            "threat_types": 1,
            "risk_score": 1,
            "policy_matches": 1,
            "tool_interception": 1,
            "provider": 1,
            "model": 1,
            "request_id": 1,
        }).sort("timestamp", -1).limit(2000).to_list(length=2000)
        audit_events = await self.db["audit_logs"].find({}, projection={
            "timestamp": 1,
            "event_type": 1,
            "action": 1,
            "severity": 1,
            "request_id": 1,
            "provider": 1,
            "model": 1,
            "risk_score": 1,
            "decision": 1,
            "matched_policies": 1,
        }).sort("timestamp", -1).limit(2000).to_list(length=2000)

        blocked_attacks = 0
        prompt_injection_attempts = 0
        high_risk_financial_operations = 0
        suspicious_tool_calls = 0
        pii_exposure_attempts = 0
        provider_failures = 0
        model_denied_events = 0
        quota_exceeded_events = 0
        usage_spikes = 0
        policy_violations = 0
        timeline: list[dict[str, Any]] = []
        request_buckets: dict[str, int] = {}

        for log in logs:
            timestamp = log.get("timestamp")
            day_key = timestamp.date().isoformat() if isinstance(timestamp, datetime) else "unknown"
            request_buckets[day_key] = int(request_buckets.get(day_key, 0)) + 1
            status_value = str(log.get("status") or "").upper()
            threat_types = {str(item or "").upper() for item in (log.get("threat_types") or [])}
            threat_type = str(log.get("threat_type") or "").upper()
            policy_names = [
                str(item.get("policy_name") or "")
                for item in (log.get("policy_matches") or [])
                if isinstance(item, dict)
            ]
            tool_interception = log.get("tool_interception") if isinstance(log.get("tool_interception"), dict) else {}

            if status_value == "BLOCKED":
                blocked_attacks += 1
            if "PROMPT_INJECTION" in threat_types or threat_type == "PROMPT_INJECTION":
                prompt_injection_attempts += 1
            if any("financial" in name.lower() or "aml" in name.lower() or "trade" in name.lower() for name in policy_names):
                high_risk_financial_operations += 1
            if tool_interception.get("tool_present") or tool_interception.get("intercepted"):
                suspicious_tool_calls += 1
            if "DATA_LEAK" in threat_types or "PII_EXPOSURE" in threat_types or threat_type in {"DATA_LEAK", "PII_EXPOSURE"}:
                pii_exposure_attempts += 1
            if status_value in {"BLOCKED", "REDACTED"} and policy_names:
                policy_violations += 1

        if request_buckets:
            average_daily_requests = sum(request_buckets.values()) / max(len(request_buckets), 1)
            usage_spikes = sum(1 for value in request_buckets.values() if value > max(average_daily_requests * 2, 25))

        for event in audit_events:
            event_name = str(event.get("event_type") or event.get("action") or "").lower()
            if event_name in {"provider_error", "provider_not_configured", "provider_auth_error", "provider_model_unavailable"}:
                provider_failures += 1
            if event_name == "model_denied":
                model_denied_events += 1
            if event_name == "quota_exceeded":
                quota_exceeded_events += 1
            if event_name in {
                "gateway_request_blocked",
                "provider_error",
                "provider_not_configured",
                "provider_auth_error",
                "provider_model_unavailable",
                "model_denied",
                "quota_exceeded",
                "policy_intercepted",
                "pii_detected",
                "financial_risk_detected",
                "tool_call_flagged",
            }:
                timeline.append(
                    {
                        "timestamp": event.get("timestamp"),
                        "event_type": event_name,
                        "severity": event.get("severity"),
                        "request_id": event.get("request_id"),
                        "provider": event.get("provider"),
                        "model": event.get("model"),
                        "decision": event.get("decision"),
                        "risk_score": event.get("risk_score"),
                        "matched_policies": event.get("matched_policies") or [],
                    }
                )

        return {
            "summary": {
                "blocked_attacks": blocked_attacks,
                "prompt_injection_attempts": prompt_injection_attempts,
                "high_risk_financial_operations": high_risk_financial_operations,
                "suspicious_tool_calls": suspicious_tool_calls,
                "pii_exposure_attempts": pii_exposure_attempts,
                "usage_spikes": usage_spikes,
                "policy_violations": policy_violations,
                "provider_failures": provider_failures,
                "model_denied_events": model_denied_events,
                "quota_exceeded_events": quota_exceeded_events,
            },
            "recent_alerts": timeline[:50],
            "realtime_limitations": {
                "streaming_alert_bus": False,
                "note": "Alerts are derived from persisted audit and gateway events. Dedicated real-time alert fanout is not fully implemented yet.",
            },
        }

    async def list_users(
        self,
        admin: dict[str, Any],
        limit: int,
        offset: int,
        q: str | None,
        is_active: bool | None = None,
        tier: str | None = None,
    ) -> list[AdminUserSummary]:
        _ = admin
        query: dict[str, Any] = {}

        if q:
            safe_pattern = q.strip()
            query["$or"] = [
                {"email": {"$regex": safe_pattern, "$options": "i"}},
                {"organization_name": {"$regex": safe_pattern, "$options": "i"}},
            ]
        if is_active is not None:
            query["is_active"] = bool(is_active)
        if tier:
            query["tier"] = str(tier).upper()

        cursor = self.db["users"].find(query).sort("created_at", -1).skip(offset).limit(limit)
        documents = await cursor.to_list(length=limit)

        payload: list[AdminUserSummary] = []
        for document in documents:
            user_id = str(document.get("_id"))
            api_key_count = await self.db["keys"].count_documents({"user_id": user_id})
            usage_count = await self.db["logs"].count_documents({"user_id": user_id})
            payload.append(
                AdminUserSummary(
                    id=user_id,
                    email=str(document.get("email", "")),
                    tier=str(document.get("tier", "FREE")),
                    organization_name=document.get("organization_name"),
                    is_active=bool(document.get("is_active", True)),
                    monthly_limit=int(document.get("monthly_limit") or 1000),
                    created_at=document.get("created_at") or self._utcnow(),
                    api_usage=int(usage_count),
                    api_key_count=int(api_key_count),
                )
            )
        return payload

    async def delete_user(self, admin: dict[str, Any], user_id: str, request: Request | None = None) -> dict[str, Any]:
        oid = self._parse_object_id(user_id)
        target = await self.db["users"].find_one({"_id": oid})
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        user_key = str(target.get("_id"))
        await self.db["users"].delete_one({"_id": oid})
        await self.db["keys"].delete_many({"user_id": user_key})
        await self.db["logs"].delete_many({"user_id": user_key})
        await self.db["notifications"].delete_many({"user_id": user_key})
        if request is not None:
            await self._record_admin_audit(
                request,
                action="admin_user_deleted",
                admin=admin,
                severity="WARNING",
                resource="admin_user",
                metadata={"target_user_id": user_key, "target_user_email": target.get("email")},
            )
        return {"deleted": True, "user_id": user_key}

    async def update_user_status(self, admin: dict[str, Any], user_id: str, payload: AdminUserStatusUpdate, request: Request | None = None) -> AdminUserSummary:
        oid = self._parse_object_id(user_id)
        now = self._utcnow()

        await self.db["users"].update_one(
            {"_id": oid},
            {"$set": {"is_active": bool(payload.is_active), "updated_at": now}},
        )
        user = await self.db["users"].find_one({"_id": oid})
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if request is not None:
            await self._record_admin_audit(
                request,
                action="admin_user_status_updated",
                admin=admin,
                severity="WARNING" if not bool(payload.is_active) else "INFO",
                resource="admin_user",
                metadata={"target_user_id": str(user.get("_id")), "target_user_email": user.get("email")},
                new_value={"is_active": bool(user.get("is_active", True))},
            )

        return AdminUserSummary(
            id=str(user.get("_id")),
            email=str(user.get("email", "")),
            tier=str(user.get("tier", "FREE")),
            organization_name=user.get("organization_name"),
            is_active=bool(user.get("is_active", True)),
            monthly_limit=int(user.get("monthly_limit") or 1000),
            created_at=user.get("created_at") or now,
            api_usage=0,
            api_key_count=0,
        )

    def _build_logs_query(
        self,
        *,
        q: str | None,
        status: str | None,
        risk_level: str | None,
        threat_type: str | None,
        only_quarantined: bool | None,
        only_threats: bool,
    ) -> dict[str, Any]:
        query: dict[str, Any] = {}
        if q:
            safe_pattern = q.strip()
            query["$or"] = [
                {"user_email": {"$regex": safe_pattern, "$options": "i"}},
                {"endpoint": {"$regex": safe_pattern, "$options": "i"}},
                {"threat_type": {"$regex": safe_pattern, "$options": "i"}},
            ]
        if status:
            query["status"] = status.upper()
        if risk_level:
            query["risk_level"] = risk_level.lower()
        if threat_type:
            query["threat_type"] = {"$regex": threat_type, "$options": "i"}
        if only_quarantined is True:
            query["is_quarantined"] = True
        if only_threats:
            query["$and"] = query.get("$and", [])
            query["$and"].append(
                {
                    "$or": [
                        {"status": {"$in": ["BLOCKED", "REDACTED"]}},
                        {"threat_type": {"$ne": None}},
                        {"is_quarantined": True},
                    ]
                }
            )
        return query

    @staticmethod
    def _serialize_log(document: dict[str, Any]) -> AdminSecurityLogResponse:
        return AdminSecurityLogResponse(
            id=str(document.get("_id")),
            timestamp=document.get("timestamp") or datetime.now(timezone.utc),
            api_key_id=str(document.get("api_key_id")) if document.get("api_key_id") is not None else None,
            user_id=str(document.get("user_id")) if document.get("user_id") is not None else None,
            user_email=document.get("user_email"),
            status=str(document.get("status") or "allowed").upper(),
            threat_type=document.get("threat_type"),
            threat_types=document.get("threat_types"),
            threat_score=float(document.get("threat_score")) if document.get("threat_score") is not None else None,
            risk_score=float(document.get("risk_score")) if document.get("risk_score") is not None else None,
            attack_vector=document.get("attack_vector"),
            risk_level=document.get("risk_level"),
            endpoint=document.get("endpoint"),
            method=document.get("method"),
            model=document.get("model"),
            latency_ms=int(document.get("latency_ms") or 0),
            tokens_used=int(document.get("tokens_used") or 0),
            ip_address=document.get("ip_address"),
            is_quarantined=bool(document.get("is_quarantined", False)),
            raw_payload=document.get("raw_payload"),
            severity=document.get("severity"),
            attack_signature=document.get("attack_signature"),
            requires_2fa=bool(document.get("requires_2fa", False)),
            review_required=bool(document.get("review_required", False)),
            policy_matches=document.get("policy_matches"),
            output_findings=document.get("output_findings"),
            tool_interception=document.get("tool_interception"),
        )

    async def list_logs(
        self,
        admin: dict[str, Any],
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
        risk_level: str | None = None,
        threat_type: str | None = None,
        only_quarantined: bool | None = None,
    ) -> list[AdminSecurityLogResponse]:
        _ = admin
        query = self._build_logs_query(
            q=q,
            status=status,
            risk_level=risk_level,
            threat_type=threat_type,
            only_quarantined=only_quarantined,
            only_threats=False,
        )
        cursor = self.db["logs"].find(query).sort("timestamp", -1).skip(offset).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [self._serialize_log(document) for document in documents]

    async def list_threats(
        self,
        admin: dict[str, Any],
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
        risk_level: str | None = None,
        threat_type: str | None = None,
        only_quarantined: bool | None = None,
    ) -> list[AdminSecurityLogResponse]:
        _ = admin
        query = self._build_logs_query(
            q=q,
            status=status,
            risk_level=risk_level,
            threat_type=threat_type,
            only_quarantined=only_quarantined,
            only_threats=True,
        )
        cursor = self.db["logs"].find(query).sort("timestamp", -1).skip(offset).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [self._serialize_log(document) for document in documents]

    async def list_api_keys(
        self,
        admin: dict[str, Any],
        limit: int,
        offset: int,
        q: str | None,
        status: str | None = None,
    ) -> list[AdminApiKeyResponse]:
        _ = admin
        query: dict[str, Any] = {}
        if status:
            query["status"] = {"$in": [status.upper(), status.lower()]}
        if q:
            safe_pattern = q.strip()
            query["$or"] = [{"name": {"$regex": safe_pattern, "$options": "i"}}, {"prefix": {"$regex": safe_pattern, "$options": "i"}}]

        cursor = self.db["keys"].find(query).sort("created_at", -1).skip(offset).limit(limit)
        docs = await cursor.to_list(length=limit)

        payload: list[AdminApiKeyResponse] = []
        for doc in docs:
            user_id = str(doc.get("user_id") or "")
            user = await self._find_user_by_identifier(user_id)
            payload.append(
                AdminApiKeyResponse(
                    id=str(doc.get("id") or doc.get("_id")),
                    user_id=user_id,
                    user_email=str((user or {}).get("email") or "unknown@example.com"),
                    name=str(doc.get("name") or "API Key"),
                    prefix=doc.get("prefix"),
                    status=str(doc.get("status") or "ACTIVE").upper(),
                    usage_count=int(doc.get("usage_count") or 0),
                    last_used=doc.get("last_used"),
                    last_ip=doc.get("last_ip"),
                    created_at=doc.get("created_at") or self._utcnow(),
                    key=None,
                )
            )
        return payload

    async def create_gateway_api_key(self, admin: dict[str, Any], payload: AdminApiKeyCreateRequest, request: Request | None = None) -> AdminApiKeyResponse:
        user = await self._get_user_or_404(payload.user_id)

        raw_key = generate_api_key()
        now = self._utcnow()
        public_id = int(now.timestamp() * 1000)
        document = {
            "id": public_id,
            "user_id": str(user.get("_id")),
            "name": payload.name,
            "prefix": raw_key[:16],
            "key_hash": self._hash_token(raw_key),
            "status": "ACTIVE",
            "usage_count": 0,
            "last_used": None,
            "last_ip": None,
            "created_at": now,
            "updated_at": now,
        }
        await self.db["keys"].insert_one(document)

        response = AdminApiKeyResponse(
            id=str(public_id),
            user_id=str(user.get("_id")),
            user_email=str(user.get("email") or ""),
            name=payload.name,
            prefix=document["prefix"],
            status=document["status"],
            usage_count=0,
            last_used=None,
            last_ip=None,
            created_at=now,
            key=raw_key,
        )
        if request is not None:
            await self._record_admin_audit(
                request,
                action="admin_api_key_created",
                admin=admin,
                severity="INFO",
                resource="api_key",
                metadata={"api_key_id": public_id, "target_user_id": str(user.get("_id")), "target_user_email": user.get("email")},
            )
        return response

    async def revoke_gateway_api_key(self, admin: dict[str, Any], key_id: str, request: Request | None = None) -> AdminApiKeyResponse:
        api_key = await self._find_key_by_identifier(key_id)
        if api_key is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

        now = self._utcnow()
        await self.db["keys"].update_one(
            {"_id": api_key["_id"]},
            {"$set": {"status": "REVOKED", "updated_at": now}},
        )

        user_id = str(api_key.get("user_id") or "")
        user = await self._find_user_by_identifier(user_id)

        response = AdminApiKeyResponse(
            id=str(api_key.get("id") or api_key.get("_id")),
            user_id=user_id,
            user_email=str((user or {}).get("email") or "unknown@example.com"),
            name=str(api_key.get("name") or "API Key"),
            prefix=api_key.get("prefix"),
            status="REVOKED",
            usage_count=int(api_key.get("usage_count") or 0),
            last_used=api_key.get("last_used"),
            last_ip=api_key.get("last_ip"),
            created_at=api_key.get("created_at") or now,
            key=None,
        )
        if request is not None:
            await self._record_admin_audit(
                request,
                action="admin_api_key_revoked",
                admin=admin,
                severity="WARNING",
                resource="api_key",
                metadata={"api_key_id": response.id, "target_user_id": user_id, "target_user_email": response.user_email},
            )
        return response

    @staticmethod
    def _default_settings(now: datetime) -> dict[str, Any]:
        return {
            "enable_gemini_module": True,
            "enable_openai_module": True,
            "enable_anthropic_module": False,
            "ai_kill_switch_enabled": False,
            "require_mfa_for_admin": False,
            "admin_rate_limit_per_minute": 120,
            "admin_rate_limit_window_seconds": 60,
            "api_key_rate_limit_per_minute": 600,
            "updated_by_user_id": None,
            "updated_at": now,
        }

    async def get_settings(self, admin: dict[str, Any]) -> AdminSettingsResponse:
        _ = admin
        now = self._utcnow()

        doc = await self.db["admin_settings"].find_one({"_singleton": True})
        if doc is None:
            defaults = {"_singleton": True, **self._default_settings(now)}
            await self.db["admin_settings"].insert_one(defaults)
            doc = defaults

        return AdminSettingsResponse(
            enable_gemini_module=bool(doc.get("enable_gemini_module", True)),
            enable_openai_module=bool(doc.get("enable_openai_module", True)),
            enable_anthropic_module=bool(doc.get("enable_anthropic_module", False)),
            ai_kill_switch_enabled=bool(doc.get("ai_kill_switch_enabled", False)),
            require_mfa_for_admin=bool(doc.get("require_mfa_for_admin", False)),
            admin_rate_limit_per_minute=int(doc.get("admin_rate_limit_per_minute", 120)),
            admin_rate_limit_window_seconds=int(doc.get("admin_rate_limit_window_seconds", 60)),
            api_key_rate_limit_per_minute=int(doc.get("api_key_rate_limit_per_minute", 600)),
            updated_by_user_id=str(doc.get("updated_by_user_id")) if doc.get("updated_by_user_id") else None,
            updated_at=doc.get("updated_at") or now,
        )

    async def update_settings(self, admin: dict[str, Any], payload: AdminSettingsUpdateRequest, request: Request | None = None) -> AdminSettingsResponse:
        now = self._utcnow()
        update_doc = {
            "enable_gemini_module": payload.enable_gemini_module,
            "enable_openai_module": payload.enable_openai_module,
            "enable_anthropic_module": payload.enable_anthropic_module,
            "ai_kill_switch_enabled": payload.ai_kill_switch_enabled,
            "require_mfa_for_admin": payload.require_mfa_for_admin,
            "admin_rate_limit_per_minute": payload.admin_rate_limit_per_minute,
            "admin_rate_limit_window_seconds": payload.admin_rate_limit_window_seconds,
            "api_key_rate_limit_per_minute": payload.api_key_rate_limit_per_minute,
            "updated_by_user_id": str(admin.get("_id") or admin.get("id") or ""),
            "updated_at": now,
        }
        await self.db["admin_settings"].update_one(
            {"_singleton": True},
            {"$set": update_doc, "$setOnInsert": {"_singleton": True}},
            upsert=True,
        )
        if request is not None:
            await self._record_admin_audit(
                request,
                action="admin_settings_updated",
                admin=admin,
                severity="WARNING" if payload.ai_kill_switch_enabled else "INFO",
                resource="admin_settings",
                new_value=update_doc,
            )
        return await self.get_settings(admin)
