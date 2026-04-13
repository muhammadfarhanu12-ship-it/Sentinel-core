from __future__ import annotations

import csv
import hashlib
import io
import re
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import Request

from app.core.config import settings
from app.routers.log_ws import schedule_broadcast
from app.routers.notification_ws import schedule_notification
from app.utils.api_key_generator import generate_api_key

UTC = timezone.utc
THREAT_STATUS_VALUES = {"BLOCKED", "REDACTED", "CLEAN"}
PLAN_LIMITS = {
    "FREE": 1_000,
    "PRO": 50_000,
    "BUSINESS": 250_000,
}
DEFAULT_SETTINGS = {
    "theme": "dark",
    "notifications": True,
    "scan_sensitivity": "medium",
    "auto_redact_pii": True,
    "block_on_injection": True,
    "alert_threshold": 0.75,
    "email_alerts": True,
    "in_app_alerts": True,
    "max_daily_scans": 100,
}
DEFAULT_AUDIT_LIMIT = 12
DEFAULT_USAGE_DAYS = 30
DEFAULT_REPORT_DAYS = 30

_counters: defaultdict[str, int] = defaultdict(int)
_fallback_store: dict[str, Any] = {
    "keys": [],
    "logs": [],
    "team": [],
    "settings": {},
    "notifications": [],
    "reports": [],
    "audit_logs": [],
    "billing": {},
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_datetime(value: Any, *, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        raw = value.strip()
        if raw:
            normalized = raw.replace("Z", "+00:00")
            try:
                parsed = datetime.fromisoformat(normalized)
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
            except ValueError:
                pass
    return fallback or utcnow()


def parse_optional_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    trimmed = str(value).strip()
    if not trimmed:
        return None
    return ensure_datetime(trimmed)


def user_id_for(current_user: dict[str, Any]) -> str:
    for key in ("id", "_id", "email"):
        value = current_user.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return "demo-user"


def workspace_id_for(current_user: dict[str, Any]) -> str:
    for key in ("organization_name", "organization", "workspace_id"):
        value = current_user.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return user_id_for(current_user)


def email_for(current_user: dict[str, Any]) -> str:
    value = current_user.get("email")
    if value is not None and str(value).strip():
        return str(value).strip().lower()
    return str(settings.DEMO_USER_EMAIL).strip().lower()


def display_name_for(current_user: dict[str, Any]) -> str:
    name = str(current_user.get("name") or "").strip()
    if name:
        return name
    local_part = email_for(current_user).split("@", 1)[0]
    tokens = [token for token in re.split(r"[._-]+", local_part) if token]
    return " ".join(token.capitalize() for token in tokens) or "Workspace Owner"


def tier_for(current_user: dict[str, Any]) -> str:
    raw_tier = str(current_user.get("tier") or "FREE").strip().upper()
    return raw_tier if raw_tier in PLAN_LIMITS else "FREE"


def monthly_limit_for(current_user: dict[str, Any]) -> int:
    tier_limit = PLAN_LIMITS[tier_for(current_user)]
    raw_limit = current_user.get("monthly_limit")
    try:
        numeric_limit = int(raw_limit)
        if numeric_limit > 0:
            return max(numeric_limit, tier_limit)
    except Exception:
        pass
    return tier_limit


def db_from_request(request: Request):
    return getattr(request.app.state, "database", None)


def collection_from_request(request: Request, name: str):
    database = db_from_request(request)
    if database is None:
        return None
    return database.get_collection(name)


def serialize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    if isinstance(value, datetime):
        return ensure_datetime(value).isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    return value


def public_document(document: dict[str, Any], *, exclude: set[str] | None = None) -> dict[str, Any]:
    serialized = serialize_value(document)
    if "id" not in serialized and "_id" in serialized:
        serialized["id"] = serialized["_id"]
    serialized.pop("_id", None)
    for field_name in exclude or set():
        serialized.pop(field_name, None)
    return serialized


async def next_numeric_id(
    request: Request,
    *,
    namespace: str,
    collection_name: str,
    fallback_items: list[dict[str, Any]],
) -> int:
    current_value = _counters[namespace]
    collection = collection_from_request(request, collection_name)

    if collection is not None:
        latest = await collection.find_one({}, sort=[("id", -1)])
        if isinstance(latest, dict):
            try:
                current_value = max(current_value, int(latest.get("id") or 0))
            except Exception:
                pass

    if fallback_items:
        for item in fallback_items:
            try:
                current_value = max(current_value, int(item.get("id") or 0))
            except Exception:
                continue

    current_value = max(current_value, int(utcnow().timestamp() * 1000))
    current_value += 1
    _counters[namespace] = current_value
    return current_value


async def list_collection_documents(
    request: Request,
    *,
    collection_name: str,
    filter_query: dict[str, Any],
    sort: list[tuple[str, int]] | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[dict[str, Any]]:
    collection = collection_from_request(request, collection_name)
    if collection is None:
        return []

    cursor = collection.find(filter_query)
    if sort:
        cursor = cursor.sort(sort)
    if skip:
        cursor = cursor.skip(skip)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=max(limit, 1))


async def ensure_user_settings(request: Request, current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "settings")
    defaults = {
        **DEFAULT_SETTINGS,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "updated_at": utcnow(),
    }

    if collection is not None:
        document = await collection.find_one({"user_id": user_id})
        if document is None:
            await collection.insert_one(defaults)
            document = defaults
        else:
            patch: dict[str, Any] = {}
            for key, value in defaults.items():
                if key not in document:
                    patch[key] = value
            if patch:
                await collection.update_one({"_id": document["_id"]}, {"$set": patch})
                document = {**document, **patch}
        return public_document(document, exclude={"user_id", "workspace_id"})

    document = _fallback_store["settings"].setdefault(user_id, defaults)
    for key, value in defaults.items():
        document.setdefault(key, value)
    return public_document(document, exclude={"user_id", "workspace_id"})


async def update_user_settings(request: Request, current_user: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    settings_patch = {key: value for key, value in patch.items() if key in DEFAULT_SETTINGS}
    settings_patch["updated_at"] = utcnow()

    collection = collection_from_request(request, "settings")
    if collection is not None:
        await collection.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    **settings_patch,
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                }
            },
            upsert=True,
        )
        document = await collection.find_one({"user_id": user_id})
    else:
        current = _fallback_store["settings"].setdefault(
            user_id,
            {
                **DEFAULT_SETTINGS,
                "user_id": user_id,
                "workspace_id": workspace_id,
                "updated_at": utcnow(),
            },
        )
        current.update(settings_patch)
        document = current

    await record_audit_event(
        request,
        current_user=current_user,
        action="SETTINGS_UPDATED",
        resource="settings",
        severity="INFO",
        new_value={key: document.get(key) for key in DEFAULT_SETTINGS},
    )
    return public_document(document or {}, exclude={"user_id", "workspace_id"})


async def ensure_primary_api_key(request: Request, current_user: dict[str, Any]) -> None:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "keys")

    if collection is not None:
        existing = await collection.find_one({"user_id": user_id, "status": {"$ne": "REVOKED"}})
        if existing is not None:
            return
        key_id = await next_numeric_id(request, namespace="keys", collection_name="keys", fallback_items=_fallback_store["keys"])
        await collection.insert_one(
            {
                "id": key_id,
                "user_id": user_id,
                "workspace_id": workspace_id,
                "name": "Workspace Primary",
                "status": "ACTIVE",
                "usage_count": 0,
                "created_at": utcnow(),
                "last_used": None,
                "key_hash": hashlib.sha256(generate_api_key().encode("utf-8")).hexdigest(),
            }
        )
        return

    existing = next((item for item in _fallback_store["keys"] if item.get("user_id") == user_id and item.get("status") != "REVOKED"), None)
    if existing is not None:
        return
    key_id = await next_numeric_id(request, namespace="keys", collection_name="keys", fallback_items=_fallback_store["keys"])
    _fallback_store["keys"].append(
        {
            "id": key_id,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "name": "Workspace Primary",
            "status": "ACTIVE",
            "usage_count": 0,
            "created_at": utcnow(),
            "last_used": None,
            "key_hash": hashlib.sha256(generate_api_key().encode("utf-8")).hexdigest(),
        }
    )


async def list_api_keys(request: Request, current_user: dict[str, Any]) -> list[dict[str, Any]]:
    await ensure_primary_api_key(request, current_user)
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "keys")
    if collection is not None:
        documents = await list_collection_documents(
            request,
            collection_name="keys",
            filter_query={"user_id": user_id},
            sort=[("created_at", -1), ("id", -1)],
            limit=200,
        )
    else:
        documents = [
            item for item in _fallback_store["keys"]
            if item.get("user_id") == user_id
        ]
        documents.sort(key=lambda item: ensure_datetime(item.get("created_at")), reverse=True)

    return [public_document(item, exclude={"user_id", "workspace_id", "key_hash"}) for item in documents]


async def create_api_key_record(request: Request, current_user: dict[str, Any], *, name: str) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    raw_key = generate_api_key()
    document = {
        "id": await next_numeric_id(request, namespace="keys", collection_name="keys", fallback_items=_fallback_store["keys"]),
        "user_id": user_id,
        "workspace_id": workspace_id,
        "name": name.strip() or "API Key",
        "status": "ACTIVE",
        "usage_count": 0,
        "created_at": utcnow(),
        "last_used": None,
        "key_hash": hashlib.sha256(raw_key.encode("utf-8")).hexdigest(),
    }

    collection = collection_from_request(request, "keys")
    if collection is not None:
        await collection.insert_one(document)
    else:
        _fallback_store["keys"].append(document)

    await record_audit_event(
        request,
        current_user=current_user,
        action="API_KEY_CREATED",
        resource="api_key",
        severity="INFO",
        metadata={"api_key_id": document["id"], "name": document["name"]},
    )
    public = public_document(document, exclude={"user_id", "workspace_id", "key_hash"})
    public["key"] = raw_key
    return public


async def revoke_api_key_record(request: Request, current_user: dict[str, Any], *, key_id: int) -> dict[str, Any] | None:
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "keys")
    document: dict[str, Any] | None = None

    if collection is not None:
        await collection.update_one(
            {"user_id": user_id, "id": key_id},
            {"$set": {"status": "REVOKED", "updated_at": utcnow()}},
        )
        document = await collection.find_one({"user_id": user_id, "id": key_id})
    else:
        for item in _fallback_store["keys"]:
            if item.get("user_id") == user_id and int(item.get("id") or 0) == key_id:
                item["status"] = "REVOKED"
                item["updated_at"] = utcnow()
                document = item
                break

    if document is None:
        return None

    await record_audit_event(
        request,
        current_user=current_user,
        action="API_KEY_REVOKED",
        resource="api_key",
        severity="WARNING",
        metadata={"api_key_id": key_id},
    )
    return public_document(document, exclude={"user_id", "workspace_id", "key_hash"})


async def resolve_api_key_id(request: Request, current_user: dict[str, Any], raw_key: str | None) -> int | None:
    user_id = user_id_for(current_user)
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest() if raw_key else None
    collection = collection_from_request(request, "keys")

    if collection is not None:
        if key_hash:
            document = await collection.find_one({"user_id": user_id, "key_hash": key_hash, "status": "ACTIVE"})
            if document is not None:
                return int(document["id"])
        document = await collection.find_one({"user_id": user_id, "status": "ACTIVE"}, sort=[("created_at", -1)])
        if document is not None:
            return int(document["id"])
        return None

    if key_hash:
        for item in _fallback_store["keys"]:
            if item.get("user_id") == user_id and item.get("status") == "ACTIVE" and item.get("key_hash") == key_hash:
                return int(item["id"])
    for item in sorted(
        [entry for entry in _fallback_store["keys"] if entry.get("user_id") == user_id and entry.get("status") == "ACTIVE"],
        key=lambda entry: ensure_datetime(entry.get("created_at")),
        reverse=True,
    ):
        return int(item["id"])
    return None


def _log_matches_filters(
    item: dict[str, Any],
    *,
    status: str | None = None,
    threat_type: str | None = None,
    api_key_id: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    q: str | None = None,
) -> bool:
    if status and str(item.get("status") or "").upper() != status.upper():
        return False
    if threat_type and str(item.get("threat_type") or "").upper() != threat_type.upper():
        return False
    if api_key_id and str(item.get("api_key_id") or "") != str(api_key_id):
        return False

    timestamp = ensure_datetime(item.get("timestamp"))
    if start_time and timestamp < start_time:
        return False
    if end_time and timestamp > end_time:
        return False

    if q:
        query = q.strip().lower()
        if query:
            haystack = " ".join(
                [
                    str(item.get("endpoint") or ""),
                    str(item.get("method") or ""),
                    str(item.get("threat_type") or ""),
                    str(item.get("request_id") or ""),
                    str(item.get("model") or ""),
                ]
            ).lower()
            if query not in haystack:
                return False

    return True


async def list_logs(
    request: Request,
    current_user: dict[str, Any],
    *,
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    threat_type: str | None = None,
    api_key_id: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "logs")

    if collection is not None:
        query: dict[str, Any] = {"workspace_id": workspace_id}
        if status:
            query["status"] = status.upper()
        if threat_type:
            query["threat_type"] = threat_type.upper()
        if api_key_id:
            query["api_key_id"] = int(api_key_id)
        if start_time or end_time:
            range_query: dict[str, Any] = {}
            if start_time:
                range_query["$gte"] = start_time
            if end_time:
                range_query["$lte"] = end_time
            query["timestamp"] = range_query
        if q and q.strip():
            regex = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [
                {"endpoint": regex},
                {"method": regex},
                {"threat_type": regex},
                {"request_id": regex},
                {"model": regex},
            ]
        documents = await list_collection_documents(
            request,
            collection_name="logs",
            filter_query=query,
            sort=[("timestamp", -1), ("id", -1)],
            skip=offset,
            limit=limit,
        )
        return [public_document(item, exclude={"workspace_id", "user_id"}) for item in documents]

    filtered = [
        item for item in _fallback_store["logs"]
        if item.get("workspace_id") == workspace_id
        and _log_matches_filters(
            item,
            status=status,
            threat_type=threat_type,
            api_key_id=api_key_id,
            start_time=start_time,
            end_time=end_time,
            q=q,
        )
    ]
    filtered.sort(key=lambda item: ensure_datetime(item.get("timestamp")), reverse=True)
    rows = filtered[offset: offset + limit]
    return [public_document(item, exclude={"workspace_id", "user_id"}) for item in rows]


def _notification_public(document: dict[str, Any]) -> dict[str, Any]:
    return public_document(document, exclude={"workspace_id"})


async def list_notifications(request: Request, current_user: dict[str, Any]) -> list[dict[str, Any]]:
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "notifications")
    if collection is not None:
        documents = await list_collection_documents(
            request,
            collection_name="notifications",
            filter_query={"user_id": user_id},
            sort=[("created_at", -1), ("id", -1)],
            limit=200,
        )
    else:
        documents = [
            item for item in _fallback_store["notifications"]
            if item.get("user_id") == user_id
        ]
        documents.sort(key=lambda item: ensure_datetime(item.get("created_at")), reverse=True)

    return [_notification_public(item) for item in documents]


async def create_notification_record(
    request: Request,
    current_user: dict[str, Any],
    *,
    title: str,
    message: str,
    notification_type: str | None,
    persist_audit: bool = True,
) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    document = {
        "id": await next_numeric_id(
            request,
            namespace="notifications",
            collection_name="notifications",
            fallback_items=_fallback_store["notifications"],
        ),
        "user_id": user_id,
        "workspace_id": workspace_id,
        "title": title.strip() or "Notification",
        "message": message.strip(),
        "type": notification_type or "info",
        "is_read": False,
        "created_at": utcnow(),
    }

    collection = collection_from_request(request, "notifications")
    if collection is not None:
        await collection.insert_one(document)
    else:
        _fallback_store["notifications"].append(document)

    public = _notification_public(document)
    schedule_notification(public, user_id=user_id)

    if persist_audit:
        await record_audit_event(
            request,
            current_user=current_user,
            action="NOTIFICATION_CREATED",
            resource="notification",
            severity="INFO",
            metadata={"notification_id": document["id"], "type": document["type"]},
        )
    return public


async def mark_notification_read(request: Request, current_user: dict[str, Any], *, notification_id: int) -> dict[str, Any] | None:
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "notifications")
    document: dict[str, Any] | None = None

    if collection is not None:
        await collection.update_one({"user_id": user_id, "id": notification_id}, {"$set": {"is_read": True}})
        document = await collection.find_one({"user_id": user_id, "id": notification_id})
    else:
        for item in _fallback_store["notifications"]:
            if item.get("user_id") == user_id and int(item.get("id") or 0) == notification_id:
                item["is_read"] = True
                document = item
                break

    return _notification_public(document) if document is not None else None


async def mark_all_notifications_read(request: Request, current_user: dict[str, Any]) -> int:
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "notifications")
    if collection is not None:
        result = await collection.update_many({"user_id": user_id, "is_read": False}, {"$set": {"is_read": True}})
        return int(result.modified_count)

    modified = 0
    for item in _fallback_store["notifications"]:
        if item.get("user_id") == user_id and not bool(item.get("is_read")):
            item["is_read"] = True
            modified += 1
    return modified


async def ensure_owner_team_member(request: Request, current_user: dict[str, Any]) -> None:
    workspace_id = workspace_id_for(current_user)
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "team")

    if collection is not None:
        existing = await collection.find_one({"workspace_id": workspace_id, "email": email_for(current_user)})
        if existing is not None:
            return
        member = {
            "id": await next_numeric_id(request, namespace="team", collection_name="team", fallback_items=_fallback_store["team"]),
            "workspace_id": workspace_id,
            "user_id": user_id,
            "email": email_for(current_user),
            "name": display_name_for(current_user),
            "role": "OWNER" if tier_for(current_user) != "FREE" else "ADMIN",
            "status": "ACTIVE",
            "invite_link": None,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        await collection.insert_one(member)
        return

    existing = next(
        (item for item in _fallback_store["team"] if item.get("workspace_id") == workspace_id and item.get("email") == email_for(current_user)),
        None,
    )
    if existing is not None:
        return
    _fallback_store["team"].append(
        {
            "id": await next_numeric_id(request, namespace="team", collection_name="team", fallback_items=_fallback_store["team"]),
            "workspace_id": workspace_id,
            "user_id": user_id,
            "email": email_for(current_user),
            "name": display_name_for(current_user),
            "role": "OWNER" if tier_for(current_user) != "FREE" else "ADMIN",
            "status": "ACTIVE",
            "invite_link": None,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )


async def list_team_members(request: Request, current_user: dict[str, Any]) -> list[dict[str, Any]]:
    await ensure_owner_team_member(request, current_user)
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "team")

    if collection is not None:
        documents = await list_collection_documents(
            request,
            collection_name="team",
            filter_query={"workspace_id": workspace_id},
            sort=[("created_at", -1), ("id", -1)],
            limit=200,
        )
    else:
        documents = [item for item in _fallback_store["team"] if item.get("workspace_id") == workspace_id]
        documents.sort(key=lambda item: ensure_datetime(item.get("created_at")), reverse=True)

    return [public_document(item, exclude={"workspace_id", "user_id"}) for item in documents]


async def invite_team_member_record(
    request: Request,
    current_user: dict[str, Any],
    *,
    email: str,
    role: str,
    generate_invite_link: bool,
) -> dict[str, Any]:
    workspace_id = workspace_id_for(current_user)
    member = {
        "id": await next_numeric_id(request, namespace="team", collection_name="team", fallback_items=_fallback_store["team"]),
        "workspace_id": workspace_id,
        "user_id": None,
        "email": email.strip().lower(),
        "name": display_name_for({"email": email.strip().lower()}),
        "role": role.strip().upper() or "VIEWER",
        "status": "PENDING",
        "invite_link": f"{settings.FRONTEND_URL.rstrip('/')}/invite/{secrets.token_urlsafe(12)}" if generate_invite_link else None,
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }

    collection = collection_from_request(request, "team")
    if collection is not None:
        await collection.insert_one(member)
    else:
        _fallback_store["team"].append(member)

    await record_audit_event(
        request,
        current_user=current_user,
        action="TEAM_MEMBER_INVITED",
        resource="team",
        severity="INFO",
        metadata={"member_id": member["id"], "email": member["email"], "role": member["role"]},
    )
    return public_document(member, exclude={"workspace_id", "user_id"})


async def update_team_member_role_record(
    request: Request,
    current_user: dict[str, Any],
    *,
    member_id: int,
    role: str,
) -> dict[str, Any] | None:
    workspace_id = workspace_id_for(current_user)
    updated_at = utcnow()
    collection = collection_from_request(request, "team")
    document: dict[str, Any] | None = None

    if collection is not None:
        await collection.update_one(
            {"workspace_id": workspace_id, "id": member_id},
            {"$set": {"role": role.strip().upper(), "updated_at": updated_at}},
        )
        document = await collection.find_one({"workspace_id": workspace_id, "id": member_id})
    else:
        for item in _fallback_store["team"]:
            if item.get("workspace_id") == workspace_id and int(item.get("id") or 0) == member_id:
                item["role"] = role.strip().upper()
                item["updated_at"] = updated_at
                document = item
                break

    if document is None:
        return None

    await record_audit_event(
        request,
        current_user=current_user,
        action="TEAM_MEMBER_ROLE_UPDATED",
        resource="team",
        severity="WARNING",
        metadata={"member_id": member_id, "role": document.get("role")},
    )
    return public_document(document, exclude={"workspace_id", "user_id"})


async def remove_team_member_record(request: Request, current_user: dict[str, Any], *, member_id: int) -> bool:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "team")

    if collection is not None:
        existing = await collection.find_one({"workspace_id": workspace_id, "id": member_id})
        if existing is None:
            return False
        await collection.delete_one({"workspace_id": workspace_id, "id": member_id})
    else:
        original_length = len(_fallback_store["team"])
        _fallback_store["team"] = [
            item for item in _fallback_store["team"]
            if not (item.get("workspace_id") == workspace_id and int(item.get("id") or 0) == member_id)
        ]
        if len(_fallback_store["team"]) == original_length:
            return False

    await record_audit_event(
        request,
        current_user=current_user,
        action="TEAM_MEMBER_REMOVED",
        resource="team",
        severity="WARNING",
        metadata={"member_id": member_id},
    )
    return True


async def record_audit_event(
    request: Request,
    *,
    current_user: dict[str, Any],
    action: str,
    resource: str,
    severity: str,
    metadata: dict[str, Any] | None = None,
    old_value: Any = None,
    new_value: Any = None,
) -> dict[str, Any]:
    workspace_id = workspace_id_for(current_user)
    document = {
        "id": await next_numeric_id(
            request,
            namespace="audit_logs",
            collection_name="audit_logs",
            fallback_items=_fallback_store["audit_logs"],
        ),
        "workspace_id": workspace_id,
        "timestamp": utcnow(),
        "actor": email_for(current_user),
        "actor_type": "USER",
        "action": action,
        "resource": resource,
        "ip_address": None,
        "severity": severity.upper(),
        "old_value": old_value,
        "new_value": new_value,
        "metadata": metadata or {},
    }

    collection = collection_from_request(request, "audit_logs")
    if collection is not None:
        await collection.insert_one(document)
    else:
        _fallback_store["audit_logs"].append(document)

    return public_document(document, exclude={"workspace_id"})


async def list_audit_logs(
    request: Request,
    current_user: dict[str, Any],
    *,
    limit: int = DEFAULT_AUDIT_LIMIT,
    offset: int = 0,
    severity: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[dict[str, Any]]:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "audit_logs")

    if collection is not None:
        query: dict[str, Any] = {"workspace_id": workspace_id}
        if severity:
            query["severity"] = severity.upper()
        if start_date or end_date:
            range_query: dict[str, Any] = {}
            if start_date:
                range_query["$gte"] = start_date
            if end_date:
                range_query["$lte"] = end_date
            query["timestamp"] = range_query
        documents = await list_collection_documents(
            request,
            collection_name="audit_logs",
            filter_query=query,
            sort=[("timestamp", -1), ("id", -1)],
            skip=offset,
            limit=limit,
        )
    else:
        documents = [item for item in _fallback_store["audit_logs"] if item.get("workspace_id") == workspace_id]
        if severity:
            documents = [item for item in documents if str(item.get("severity") or "").upper() == severity.upper()]
        if start_date:
            documents = [item for item in documents if ensure_datetime(item.get("timestamp")) >= start_date]
        if end_date:
            documents = [item for item in documents if ensure_datetime(item.get("timestamp")) <= end_date]
        documents.sort(key=lambda item: ensure_datetime(item.get("timestamp")), reverse=True)
        documents = documents[offset: offset + limit]

    if documents:
        return [public_document(item, exclude={"workspace_id"}) for item in documents]

    synthetic: list[dict[str, Any]] = []
    logs = await list_logs(request, current_user, limit=20, offset=0)
    if logs:
        most_recent = logs[0]
        synthetic.append(
            {
                "id": f"synthetic-{most_recent['id']}",
                "timestamp": most_recent["timestamp"],
                "actor": "System",
                "actor_type": "SYSTEM",
                "action": "SCAN_ACTIVITY_REVIEWED",
                "resource": "logs",
                "ip_address": None,
                "severity": "CRITICAL" if str(most_recent.get("status") or "").upper() in {"BLOCKED", "REDACTED"} else "INFO",
                "old_value": None,
                "new_value": {"status": most_recent.get("status"), "threat_type": most_recent.get("threat_type")},
                "metadata": {"request_id": most_recent.get("request_id")},
            }
        )
    synthetic.append(
        {
            "id": "synthetic-settings",
            "timestamp": utcnow().isoformat(),
            "actor": email_for(current_user),
            "actor_type": "USER",
            "action": "WORKSPACE_READY",
            "resource": "dashboard",
            "ip_address": None,
            "severity": "INFO",
            "old_value": None,
            "new_value": {"workspace_id": workspace_id},
            "metadata": {"mode": "synthetic_fallback"},
        }
    )
    return synthetic[offset: offset + limit]


async def get_subscription(request: Request, current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    tier = tier_for(current_user)
    default_subscription = {
        "tier": tier,
        "monthly_limit": monthly_limit_for(current_user),
        "status": "active",
        "updated_at": utcnow(),
    }

    collection = collection_from_request(request, "billing")
    if collection is not None:
        document = await collection.find_one({"user_id": user_id})
        if document is None:
            await collection.insert_one({"user_id": user_id, **default_subscription})
            document = {"user_id": user_id, **default_subscription}
        return public_document(document, exclude={"user_id"})

    document = _fallback_store["billing"].setdefault(user_id, default_subscription)
    for key, value in default_subscription.items():
        document.setdefault(key, value)
    return public_document(document)


async def create_checkout_session(request: Request, current_user: dict[str, Any], *, plan_name: str) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    tier = str(plan_name or tier_for(current_user)).strip().upper() or "FREE"
    resolved_tier = tier if tier in PLAN_LIMITS else tier_for(current_user)
    document = {
        "tier": resolved_tier,
        "monthly_limit": PLAN_LIMITS[resolved_tier],
        "status": "active",
        "updated_at": utcnow(),
    }

    collection = collection_from_request(request, "billing")
    if collection is not None:
        await collection.update_one({"user_id": user_id}, {"$set": {"user_id": user_id, **document}}, upsert=True)
    else:
        _fallback_store["billing"][user_id] = {"user_id": user_id, **document}

    await record_audit_event(
        request,
        current_user=current_user,
        action="SUBSCRIPTION_UPDATED",
        resource="billing",
        severity="INFO",
        new_value={"tier": resolved_tier, "monthly_limit": PLAN_LIMITS[resolved_tier]},
    )
    return public_document(document)


async def load_workspace_logs(request: Request, current_user: dict[str, Any], *, max_items: int = 5_000) -> list[dict[str, Any]]:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "logs")
    if collection is not None:
        documents = await list_collection_documents(
            request,
            collection_name="logs",
            filter_query={"workspace_id": workspace_id},
            sort=[("timestamp", -1), ("id", -1)],
            limit=max_items,
        )
    else:
        documents = [item for item in _fallback_store["logs"] if item.get("workspace_id") == workspace_id]
        documents.sort(key=lambda item: ensure_datetime(item.get("timestamp")), reverse=True)
        documents = documents[:max_items]
    return documents


def _bucket_start(timestamp: datetime, granularity: str) -> datetime:
    normalized = ensure_datetime(timestamp)
    if granularity == "weekly":
        week_start = normalized - timedelta(days=normalized.weekday())
        return week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    return normalized.replace(hour=0, minute=0, second=0, microsecond=0)


def _generate_period_starts(*, start_time: datetime, end_time: datetime, granularity: str) -> list[datetime]:
    step = timedelta(days=7 if granularity == "weekly" else 1)
    periods: list[datetime] = []
    current = _bucket_start(start_time, granularity)
    end_bucket = _bucket_start(end_time, granularity)
    while current <= end_bucket:
        periods.append(current)
        current += step
    return periods


def build_threat_counts_payload(
    logs: list[dict[str, Any]],
    *,
    granularity: str,
    start_time: datetime,
    end_time: datetime,
) -> dict[str, Any]:
    periods = _generate_period_starts(start_time=start_time, end_time=end_time, granularity=granularity)
    aggregates = {
        period.isoformat(): {
            "period_start": period.isoformat(),
            "blocked": 0,
            "redacted": 0,
            "clean": 0,
            "total": 0,
        }
        for period in periods
    }

    for log in logs:
        timestamp = ensure_datetime(log.get("timestamp"))
        if timestamp < start_time or timestamp > end_time:
            continue
        key = _bucket_start(timestamp, granularity).isoformat()
        bucket = aggregates.get(key)
        if bucket is None:
            continue
        status = str(log.get("status") or "CLEAN").upper()
        if status not in THREAT_STATUS_VALUES:
            status = "CLEAN"
        bucket[status.lower()] += 1
        bucket["total"] += 1

    return {
        "granularity": granularity,
        "start_time": ensure_datetime(start_time).isoformat(),
        "end_time": ensure_datetime(end_time).isoformat(),
        "series": list(aggregates.values()),
    }


async def get_threat_counts(
    request: Request,
    current_user: dict[str, Any],
    *,
    granularity: str,
    days: int,
    start_time: datetime | None,
    end_time: datetime | None,
) -> dict[str, Any]:
    resolved_granularity = "weekly" if str(granularity).lower() == "weekly" else "daily"
    resolved_end = end_time or utcnow()
    resolved_start = start_time or (resolved_end - timedelta(days=max(1, days) - 1))
    logs = await load_workspace_logs(request, current_user)
    return build_threat_counts_payload(
        logs,
        granularity=resolved_granularity,
        start_time=resolved_start,
        end_time=resolved_end,
    )


async def list_remediations(
    request: Request,
    current_user: dict[str, Any],
    *,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    workspace_id = workspace_id_for(current_user)
    collection = collection_from_request(request, "reports")
    if collection is not None:
        documents = await list_collection_documents(
            request,
            collection_name="reports",
            filter_query={"workspace_id": workspace_id, "kind": "remediation"},
            sort=[("created_at", -1), ("id", -1)],
            skip=offset,
            limit=limit,
        )
    else:
        documents = [
            item for item in _fallback_store["reports"]
            if item.get("workspace_id") == workspace_id and item.get("kind") == "remediation"
        ]
        documents.sort(key=lambda item: ensure_datetime(item.get("created_at")), reverse=True)
        documents = documents[offset: offset + limit]

    return [public_document(item, exclude={"workspace_id", "kind"}) for item in documents]


def render_threat_counts_csv(payload: dict[str, Any]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["period_start", "blocked", "redacted", "clean", "total"])
    writer.writeheader()
    for row in payload.get("series", []):
        writer.writerow(
            {
                "period_start": row.get("period_start"),
                "blocked": row.get("blocked", 0),
                "redacted": row.get("redacted", 0),
                "clean": row.get("clean", 0),
                "total": row.get("total", 0),
            }
        )
    return buffer.getvalue()


def render_remediations_csv(rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=[
            "id",
            "created_at",
            "user_id",
            "api_key_id",
            "security_log_id",
            "request_id",
            "threat_type",
            "threat_score",
            "actions",
            "email_to",
            "webhook_urls",
            "error",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "id": row.get("id"),
                "created_at": row.get("created_at"),
                "user_id": row.get("user_id"),
                "api_key_id": row.get("api_key_id"),
                "security_log_id": row.get("security_log_id"),
                "request_id": row.get("request_id"),
                "threat_type": row.get("threat_type"),
                "threat_score": row.get("threat_score"),
                "actions": serialize_value(row.get("actions") or []),
                "email_to": row.get("email_to"),
                "webhook_urls": serialize_value(row.get("webhook_urls") or []),
                "error": row.get("error"),
            }
        )
    return buffer.getvalue()


async def get_usage_summary(request: Request, current_user: dict[str, Any]) -> dict[str, Any]:
    logs = await load_workspace_logs(request, current_user)
    now = utcnow()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    trend_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=DEFAULT_USAGE_DAYS - 1)

    monthly_requests = 0
    blocked_injections = 0
    trend_buckets = {
        (trend_start + timedelta(days=offset)).date().isoformat(): {
            "date": (trend_start + timedelta(days=offset)).date().isoformat(),
            "requests": 0,
            "threats": 0,
        }
        for offset in range(DEFAULT_USAGE_DAYS)
    }

    for log in logs:
        timestamp = ensure_datetime(log.get("timestamp"))
        if timestamp >= current_month_start:
            monthly_requests += 1
        status = str(log.get("status") or "").upper()
        threat_type = str(log.get("threat_type") or "").upper()
        if status == "BLOCKED" and threat_type == "PROMPT_INJECTION":
            blocked_injections += 1
        day_key = timestamp.date().isoformat()
        if day_key in trend_buckets:
            trend_buckets[day_key]["requests"] += 1
            if status in {"BLOCKED", "REDACTED"}:
                trend_buckets[day_key]["threats"] += 1

    limit = monthly_limit_for(current_user)
    settings_doc = await ensure_user_settings(request, current_user)
    return {
        "total_requests": len(logs),
        "blocked_injections": blocked_injections,
        "monthly_credits_remaining": max(limit - monthly_requests, 0),
        "quota": {
            "used": monthly_requests,
            "limit": limit,
        },
        "notify_at_80": True,
        "trend": list(trend_buckets.values()),
        "settings": {
            "email_alerts": settings_doc.get("email_alerts"),
            "in_app_alerts": settings_doc.get("in_app_alerts"),
        },
    }


async def get_analytics_summary(request: Request, current_user: dict[str, Any]) -> dict[str, Any]:
    logs = await load_workspace_logs(request, current_user)
    now = utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    trend_start = today_start - timedelta(days=6)
    trend_buckets = {
        (trend_start + timedelta(days=offset)).date().isoformat(): {
            "date": (trend_start + timedelta(days=offset)).date().isoformat(),
            "clean": 0,
            "blocked": 0,
        }
        for offset in range(7)
    }

    blocked = 0
    prompt_injections = 0
    data_leaks = 0
    api_requests_today = 0

    for log in logs:
        timestamp = ensure_datetime(log.get("timestamp"))
        status = str(log.get("status") or "").upper()
        threat_type = str(log.get("threat_type") or "").upper()

        if status == "BLOCKED":
            blocked += 1
        if threat_type == "PROMPT_INJECTION":
            prompt_injections += 1
        if threat_type in {"DATA_LEAK", "PII_EXPOSURE"}:
            data_leaks += 1
        if timestamp >= today_start:
            api_requests_today += 1

        day_key = timestamp.date().isoformat()
        if day_key in trend_buckets:
            if status == "CLEAN":
                trend_buckets[day_key]["clean"] += 1
            else:
                trend_buckets[day_key]["blocked"] += 1

    usage = await get_usage_summary(request, current_user)
    total_events = max(len(logs), 1)
    security_score = max(0, min(100, round(100 - ((blocked / total_events) * 65) - ((data_leaks / total_events) * 20))))

    return {
        "totalThreatsBlocked": blocked,
        "promptInjectionsDetected": prompt_injections,
        "dataLeaksPrevented": data_leaks,
        "apiRequestsToday": api_requests_today,
        "securityScore": security_score,
        "threatsOverTime": list(trend_buckets.values()),
        "usageVsLimit": {
            "name": "usage",
            "used": usage["quota"]["used"],
            "limit": usage["quota"]["limit"],
        },
    }


async def persist_scan_result(
    request: Request,
    current_user: dict[str, Any],
    *,
    prompt: str,
    provider: str,
    model: str,
    security_tier: str,
    scan_result: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    user_id = user_id_for(current_user)
    workspace_id = workspace_id_for(current_user)
    api_key_id = await resolve_api_key_id(request, current_user, request.headers.get("x-api-key"))
    request_id = getattr(request.state, "request_id", None) or f"req_{secrets.token_hex(8)}"
    now = utcnow()

    log_doc = {
        "id": await next_numeric_id(request, namespace="logs", collection_name="logs", fallback_items=_fallback_store["logs"]),
        "workspace_id": workspace_id,
        "user_id": user_id,
        "api_key_id": api_key_id,
        "timestamp": now,
        "status": str(scan_result.get("status") or "CLEAN").upper(),
        "threat_type": str(scan_result.get("threat_type") or "NONE").upper(),
        "threat_types": [str(item).upper() for item in scan_result.get("threat_types") or []],
        "threat_score": float(scan_result.get("threat_score") or 0.0),
        "risk_score": float(scan_result.get("threat_score") or 0.0),
        "risk_level": str(scan_result.get("risk_level") or "low").lower(),
        "tokens_used": max(1, len(prompt.split())),
        "latency_ms": int(runtime.get("duration_ms") or 0),
        "endpoint": "/api/v1/scan",
        "method": "POST",
        "model": model,
        "provider": provider,
        "security_tier": security_tier,
        "request_id": request_id,
        "raw_payload": {"prompt": prompt[:2_000]},
        "sanitized_content": scan_result.get("sanitized_content"),
        "created_at": now,
    }

    collection = collection_from_request(request, "logs")
    if collection is not None:
        await collection.insert_one(log_doc)
    else:
        _fallback_store["logs"].append(log_doc)

    if api_key_id is not None:
        await increment_api_key_usage(request, current_user, api_key_id=api_key_id, used_at=now)

    public_log = public_document(log_doc, exclude={"workspace_id", "user_id"})
    schedule_broadcast(public_log, user_id=user_id)

    status = str(log_doc["status"]).upper()
    if status in {"BLOCKED", "REDACTED"}:
        remediation_doc = {
            "id": await next_numeric_id(request, namespace="reports", collection_name="reports", fallback_items=_fallback_store["reports"]),
            "kind": "remediation",
            "workspace_id": workspace_id,
            "created_at": now,
            "user_id": user_id,
            "api_key_id": api_key_id,
            "security_log_id": log_doc["id"],
            "request_id": request_id,
            "threat_type": log_doc["threat_type"],
            "threat_score": log_doc["threat_score"],
            "actions": [
                {
                    "type": "QUARANTINE_REQUEST" if status == "BLOCKED" else "ALERT_EMAIL",
                    "status": "SUCCESS",
                },
                {
                    "type": "ALERT_EMAIL" if status == "BLOCKED" else "ALERT_WEBHOOK",
                    "status": "SUCCESS",
                },
            ],
            "email_to": email_for(current_user),
            "webhook_urls": settings.remediation_webhook_urls_list,
            "error": None,
        }
        reports_collection = collection_from_request(request, "reports")
        if reports_collection is not None:
            await reports_collection.insert_one(remediation_doc)
        else:
            _fallback_store["reports"].append(remediation_doc)

        user_settings = await ensure_user_settings(request, current_user)
        if bool(user_settings.get("in_app_alerts", True)):
            await create_notification_record(
                request,
                current_user,
                title=f"{status.title()} {log_doc['threat_type'].replace('_', ' ')}",
                message=f"Sentinel {status.lower()} request {request_id}.",
                notification_type="remediation",
                persist_audit=False,
            )

    await record_audit_event(
        request,
        current_user=current_user,
        action="SCAN_EXECUTED",
        resource="scan",
        severity="CRITICAL" if status in {"BLOCKED", "REDACTED"} else "INFO",
        new_value={
            "status": status,
            "threat_type": log_doc["threat_type"],
            "request_id": request_id,
        },
        metadata={
            "provider": provider,
            "model": model,
            "security_tier": security_tier,
        },
    )

    return public_log


async def increment_api_key_usage(request: Request, current_user: dict[str, Any], *, api_key_id: int, used_at: datetime) -> None:
    user_id = user_id_for(current_user)
    collection = collection_from_request(request, "keys")
    if collection is not None:
        await collection.update_one(
            {"user_id": user_id, "id": api_key_id},
            {"$inc": {"usage_count": 1}, "$set": {"last_used": used_at}},
        )
        return

    for item in _fallback_store["keys"]:
        if item.get("user_id") == user_id and int(item.get("id") or 0) == api_key_id:
            item["usage_count"] = int(item.get("usage_count") or 0) + 1
            item["last_used"] = used_at
            return
