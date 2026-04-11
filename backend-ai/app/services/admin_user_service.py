from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import users_collection
from app.models.user_model import user_model
from app.schemas.user_schema import UserResponse
from app.security.roles import ADMIN_ROLE, USER_ROLE
from app.utils.hash import hash_password

logger = logging.getLogger(__name__)

_SENSITIVE_USER_FIELDS = {
    "hashed_password": 0,
    "verification_token_hash": 0,
    "verify_token_hash": 0,
    "verification_token": 0,
    "verify_token": 0,
    "reset_token_hash": 0,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _resolve_domain(email: str) -> str:
    return email.split("@", 1)[1].strip().lower()


def _validate_admin_identity(*, email: str, password: str) -> None:
    if not email or "@" not in email:
        raise ValueError("A valid admin email is required.")
    if not password or not password.strip():
        raise ValueError("An admin password is required.")


def _database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Admin user storage is unavailable. Check the MongoDB connection.",
    )


def _serialize_user(document: dict) -> UserResponse:
    return UserResponse.model_validate(user_model(document))


async def ensure_admin_user(*, email: str, password: str, name: str | None = None) -> UserResponse:
    normalized_email = _normalize_email(email)
    _validate_admin_identity(email=normalized_email, password=password)
    now = _utcnow()

    try:
        existing_user = await users_collection.find_one({"email": normalized_email})
    except PyMongoError as exc:
        logger.exception("Failed to load admin candidate email=%s", normalized_email)
        raise _database_error() from exc

    document = {
        "email": normalized_email,
        "name": name or (existing_user.get("name") if existing_user else None),
        "hashed_password": hash_password(password),
        "organization_name": (existing_user.get("organization_name") if existing_user else None) or _resolve_domain(normalized_email),
        "tier": (existing_user.get("tier") if existing_user else None) or "FREE",
        "role": ADMIN_ROLE,
        "is_active": True,
        "is_verified": True,
        "verification_token_hash": None,
        "verify_token_hash": None,
        "verification_token": None,
        "verify_token": None,
        "verification_token_expiry": None,
        "verify_token_expires_at": None,
        "reset_token_hash": None,
        "reset_token_expiry": None,
        "email_verified_at": (existing_user.get("email_verified_at") if existing_user else None) or now,
        "password_updated_at": now,
        "updated_at": now,
    }

    try:
        if existing_user is not None:
            await users_collection.update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        **document,
                        "created_at": existing_user.get("created_at", now),
                        "last_login_at": existing_user.get("last_login_at"),
                    }
                },
            )
            admin_user = await users_collection.find_one({"_id": existing_user["_id"]})
            logger.info(
                "Admin user promoted or refreshed email=%s previous_role=%s",
                normalized_email,
                existing_user.get("role", USER_ROLE),
            )
        else:
            result = await users_collection.insert_one(
                {
                    **document,
                    "created_at": now,
                    "last_login_at": None,
                }
            )
            admin_user = await users_collection.find_one({"_id": result.inserted_id})
            logger.info("Admin user created email=%s", normalized_email)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists") from exc
    except PyMongoError as exc:
        logger.exception("Failed to upsert admin user email=%s", normalized_email)
        raise _database_error() from exc

    if admin_user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Admin user could not be loaded")
    return _serialize_user(admin_user)


async def list_users(*, limit: int = 50, skip: int = 0) -> list[UserResponse]:
    try:
        cursor = (
            users_collection.find({}, projection=_SENSITIVE_USER_FIELDS)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        documents = await cursor.to_list(length=limit)
    except PyMongoError as exc:
        logger.exception("Failed to list users for admin panel")
        raise _database_error() from exc

    return [_serialize_user(document) for document in documents]
