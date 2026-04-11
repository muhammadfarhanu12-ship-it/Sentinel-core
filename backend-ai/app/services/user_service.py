from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import users_collection
from app.models.user_model import user_model
from app.schemas.user_schema import LoginRequest, SignupRequest, UserResponse
from app.utils.hash import hash_password, verify_password

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def create_user(payload: SignupRequest) -> UserResponse:
    normalized_email = _normalize_email(str(payload.email))
    now = _utcnow()
    document = {
        "email": normalized_email,
        "hashed_password": hash_password(payload.password),
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = await users_collection.insert_one(document)
        created_user = await users_collection.find_one({"_id": result.inserted_id})
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc
    except PyMongoError as exc:
        logger.exception("Failed to create user '%s'", normalized_email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is temporarily unavailable.",
        ) from exc

    if created_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User was created but could not be loaded.",
        )

    return UserResponse.model_validate(user_model(created_user))


async def authenticate_user(payload: LoginRequest) -> UserResponse:
    normalized_email = _normalize_email(str(payload.email))

    try:
        user_document = await users_collection.find_one({"email": normalized_email})
    except PyMongoError as exc:
        logger.exception("Failed to read user '%s'", normalized_email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is temporarily unavailable.",
        ) from exc

    if user_document is None or not verify_password(payload.password, user_document["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    try:
        await users_collection.update_one(
            {"_id": user_document["_id"]},
            {"$set": {"updated_at": _utcnow()}},
        )
        user_document["updated_at"] = _utcnow()
    except PyMongoError:
        logger.warning("Unable to update last activity for user '%s'", normalized_email)

    return UserResponse.model_validate(user_model(user_document))
