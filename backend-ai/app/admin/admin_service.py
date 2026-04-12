from __future__ import annotations

import hashlib
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
from app.utils.api_key_generator import generate_api_key
from app.utils.hashing import get_password_hash, verify_password
from app.utils.token_generator import create_access_token


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
    def _parse_object_id(value: str) -> ObjectId:
        try:
            return ObjectId(value)
        except (InvalidId, TypeError) as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found") from exc

    async def _get_user_or_404(self, user_id: str) -> dict[str, Any]:
        user = await self.db["users"].find_one({"_id": self._parse_object_id(user_id)})
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    async def login(self, email: str, password: str, request: Request) -> AdminTokenResponse:
        normalized_email = self._normalize_email(email)
        check_rate_limit(
            f"admin-login:{self._get_client_ip(request) or normalized_email}",
            scope="admin-login",
            limit=5,
            window_seconds=60,
        )

        user = await self.db["users"].find_one({"email": normalized_email})
        if user is None or not verify_password(password, str(user.get("hashed_password", ""))):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")
        if not bool(user.get("is_active", True)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account is inactive")
        if not is_admin_role(user.get("role")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        now = self._utcnow()
        await self.db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": now, "updated_at": now, "role": ADMIN_ROLE}},
        )

        access_token = create_access_token(
            data={
                "sub": normalized_email,
                "user_id": str(user["_id"]),
                "role": ADMIN_ROLE,
            }
        )
        return AdminTokenResponse(access_token=access_token)

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
        total_requests = await self.db["security_logs"].count_documents({})
        threats_blocked = await self.db["security_logs"].count_documents(
            {
                "$or": [
                    {"status": {"$in": ["BLOCKED", "REDACTED"]}},
                    {"is_quarantined": True},
                ]
            }
        )
        active_api_keys = await self.db["api_keys"].count_documents({"status": "active"})
        quarantined_api_keys = await self.db["api_keys"].count_documents({"status": "quarantined"})

        avg_latency_result = await self.db["security_logs"].aggregate(
            [{"$group": {"_id": None, "avg": {"$avg": "$latency_ms"}}}]
        ).to_list(length=1)
        avg_latency_ms = float(avg_latency_result[0]["avg"]) if avg_latency_result else 0.0

        start = self._utcnow() - timedelta(days=7)
        series_rows = await self.db["security_logs"].aggregate(
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
        )

    async def get_system_status(self, admin: dict[str, Any]) -> AdminSystemStatusResponse:
        _ = admin
        database_status = "ok"
        try:
            await self.db.command("ping")
        except Exception:
            database_status = "error"

        latest_event = await self.db["security_logs"].find_one(sort=[("timestamp", -1)], projection={"timestamp": 1})
        admin_count = await self.db["users"].count_documents({"role": ADMIN_ROLE})

        return AdminSystemStatusResponse(
            status="ok" if database_status == "ok" else "degraded",
            database=database_status,
            uptime_hint="Gateway operational",
            admin_count=int(admin_count),
            last_security_event_at=latest_event.get("timestamp") if latest_event else None,
        )

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
            api_key_count = await self.db["api_keys"].count_documents({"user_id": user_id})
            usage_count = await self.db["security_logs"].count_documents({"user_id": user_id})
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

    async def delete_user(self, admin: dict[str, Any], user_id: str) -> dict[str, Any]:
        _ = admin
        oid = self._parse_object_id(user_id)
        target = await self.db["users"].find_one({"_id": oid})
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        user_key = str(target.get("_id"))
        await self.db["users"].delete_one({"_id": oid})
        await self.db["api_keys"].delete_many({"user_id": user_key})
        await self.db["security_logs"].delete_many({"user_id": user_key})
        await self.db["notifications"].delete_many({"user_id": user_key})

        return {"deleted": True, "user_id": user_key}

    async def update_user_status(self, admin: dict[str, Any], user_id: str, payload: AdminUserStatusUpdate) -> AdminUserSummary:
        _ = admin
        oid = self._parse_object_id(user_id)
        now = self._utcnow()

        await self.db["users"].update_one(
            {"_id": oid},
            {"$set": {"is_active": bool(payload.is_active), "updated_at": now}},
        )
        user = await self.db["users"].find_one({"_id": oid})
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

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
        cursor = self.db["security_logs"].find(query).sort("timestamp", -1).skip(offset).limit(limit)
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
        cursor = self.db["security_logs"].find(query).sort("timestamp", -1).skip(offset).limit(limit)
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
            query["status"] = status.lower()
        if q:
            safe_pattern = q.strip()
            query["$or"] = [{"name": {"$regex": safe_pattern, "$options": "i"}}, {"prefix": {"$regex": safe_pattern, "$options": "i"}}]

        cursor = self.db["api_keys"].find(query).sort("created_at", -1).skip(offset).limit(limit)
        docs = await cursor.to_list(length=limit)

        payload: list[AdminApiKeyResponse] = []
        for doc in docs:
            user_id = str(doc.get("user_id") or "")
            user = await self.db["users"].find_one({"_id": self._parse_object_id(user_id)}) if ObjectId.is_valid(user_id) else None
            payload.append(
                AdminApiKeyResponse(
                    id=str(doc.get("_id")),
                    user_id=user_id,
                    user_email=str((user or {}).get("email") or "unknown@example.com"),
                    name=str(doc.get("name") or "API Key"),
                    prefix=doc.get("prefix"),
                    status=str(doc.get("status") or "active"),
                    usage_count=int(doc.get("usage_count") or 0),
                    last_used=doc.get("last_used"),
                    last_ip=doc.get("last_ip"),
                    created_at=doc.get("created_at") or self._utcnow(),
                    key=None,
                )
            )
        return payload

    async def create_gateway_api_key(self, admin: dict[str, Any], payload: AdminApiKeyCreateRequest) -> AdminApiKeyResponse:
        _ = admin
        user = await self._get_user_or_404(payload.user_id)

        raw_key = generate_api_key()
        now = self._utcnow()
        document = {
            "user_id": str(user.get("_id")),
            "name": payload.name,
            "prefix": raw_key[:16],
            "key_hash": self._hash_token(raw_key),
            "status": "active",
            "usage_count": 0,
            "last_used": None,
            "last_ip": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db["api_keys"].insert_one(document)

        return AdminApiKeyResponse(
            id=str(result.inserted_id),
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

    async def revoke_gateway_api_key(self, admin: dict[str, Any], key_id: str) -> AdminApiKeyResponse:
        _ = admin
        oid = self._parse_object_id(key_id)

        api_key = await self.db["api_keys"].find_one({"_id": oid})
        if api_key is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

        now = self._utcnow()
        await self.db["api_keys"].update_one(
            {"_id": oid},
            {"$set": {"status": "revoked", "updated_at": now}},
        )

        user = None
        user_id = str(api_key.get("user_id") or "")
        if ObjectId.is_valid(user_id):
            user = await self.db["users"].find_one({"_id": ObjectId(user_id)})

        return AdminApiKeyResponse(
            id=str(api_key.get("_id")),
            user_id=user_id,
            user_email=str((user or {}).get("email") or "unknown@example.com"),
            name=str(api_key.get("name") or "API Key"),
            prefix=api_key.get("prefix"),
            status="revoked",
            usage_count=int(api_key.get("usage_count") or 0),
            last_used=api_key.get("last_used"),
            last_ip=api_key.get("last_ip"),
            created_at=api_key.get("created_at") or now,
            key=None,
        )

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

    async def update_settings(self, admin: dict[str, Any], payload: AdminSettingsUpdateRequest) -> AdminSettingsResponse:
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
        return await self.get_settings(admin)
