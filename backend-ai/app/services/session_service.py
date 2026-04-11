from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import settings
from app.database import auth_sessions_collection
from app.schemas.auth_schema import TokenData
from app.utils.token_generator import create_refresh_token

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Authentication session storage is unavailable. Check the MongoDB connection.",
    )


def _credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _hash_jti(jti: str) -> str:
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def _claims_from_refresh_token(token: str) -> dict[str, Any]:
    try:
        claims = jwt.get_unverified_claims(token)
    except JWTError as exc:
        raise _credentials_error() from exc

    if str(claims.get("type", "")) != "refresh" or not claims.get("jti"):
        raise _credentials_error()
    return claims


def _expiry_from_claims(claims: dict[str, Any]) -> datetime:
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        raise _credentials_error()
    return datetime.fromtimestamp(float(exp), tz=timezone.utc)


async def create_refresh_session(*, user_id: str, email: str, extra_claims: dict[str, Any] | None = None) -> str:
    payload = {"sub": email, "user_id": user_id, **(extra_claims or {})}
    token = create_refresh_token(data=payload)
    claims = _claims_from_refresh_token(token)

    session_document = {
        "user_id": str(user_id),
        "email": str(email).lower(),
        "jti_hash": _hash_jti(str(claims["jti"])),
        "token_type": "refresh",
        "expires_at": _expiry_from_claims(claims),
        "created_at": _utcnow(),
        "updated_at": _utcnow(),
        "revoked_at": None,
        "revocation_reason": None,
    }

    try:
        await auth_sessions_collection.insert_one(session_document)
    except DuplicateKeyError:
        logger.warning("Refresh token collision detected for user_id=%s", user_id)
        return await create_refresh_session(user_id=user_id, email=email, extra_claims=extra_claims)
    except PyMongoError as exc:
        logger.exception("Failed to store refresh session for user_id=%s", user_id)
        raise _database_error() from exc

    return token


async def assert_refresh_session_is_active(token_data: TokenData) -> None:
    if not token_data.jti:
        raise _credentials_error()

    try:
        session = await auth_sessions_collection.find_one({"jti_hash": _hash_jti(str(token_data.jti))})
    except PyMongoError as exc:
        logger.exception("Failed to load refresh session for user_id=%s", token_data.user_id)
        raise _database_error() from exc

    if session is None or session.get("revoked_at"):
        raise _credentials_error()

    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        normalized_expiry = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        if normalized_expiry <= _utcnow():
            raise _credentials_error()


async def revoke_refresh_session(token_data: TokenData, *, reason: str) -> None:
    if not token_data.jti:
        return

    try:
        await auth_sessions_collection.update_one(
            {"jti_hash": _hash_jti(str(token_data.jti)), "revoked_at": None},
            {
                "$set": {
                    "revoked_at": _utcnow(),
                    "revocation_reason": reason,
                    "updated_at": _utcnow(),
                }
            },
        )
    except PyMongoError as exc:
        logger.exception("Failed to revoke refresh session for user_id=%s", token_data.user_id)
        raise _database_error() from exc


async def rotate_refresh_session(token_data: TokenData, *, user_id: str, email: str, extra_claims: dict[str, Any] | None = None) -> str:
    await assert_refresh_session_is_active(token_data)
    await revoke_refresh_session(token_data, reason="rotated")
    return await create_refresh_session(user_id=user_id, email=email, extra_claims=extra_claims)


async def revoke_all_refresh_sessions_for_user(*, user_id: str, reason: str) -> int:
    try:
        result = await auth_sessions_collection.update_many(
            {"user_id": str(user_id), "revoked_at": None},
            {
                "$set": {
                    "revoked_at": _utcnow(),
                    "revocation_reason": reason,
                    "updated_at": _utcnow(),
                }
            },
        )
    except PyMongoError as exc:
        logger.exception("Failed to revoke all refresh sessions for user_id=%s", user_id)
        raise _database_error() from exc

    return int(getattr(result, "modified_count", 0))
