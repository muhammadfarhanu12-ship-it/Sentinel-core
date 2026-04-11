from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import settings
from app.database import users_collection
from app.models.user_model import user_model
from app.schemas.user_schema import SignupRequest, UserResponse
from app.security.roles import ADMIN_ROLE, USER_ROLE, normalize_user_role
from app.security.disposable_email_domains import DISPOSABLE_EMAIL_DOMAINS
from app.services.email_service import (
    build_reset_password_link,
    build_verification_link,
    send_password_reset_email_async,
    send_verification_email_async,
)
from app.services.session_service import revoke_all_refresh_sessions_for_user
from app.utils.token_generator import create_password_reset_token
from app.utils.hash import hash_password, verify_password

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SignupResult:
    user: UserResponse
    verification_token: str
    verification_link: str


@dataclass(slots=True)
class PasswordResetIssueResult:
    email_sent: bool
    reset_token: str | None = None
    reset_link: str | None = None


@dataclass(slots=True)
class ResendVerificationResult:
    message: str
    email_sent: bool


@dataclass(slots=True)
class VerificationTokenRecord:
    token: str
    token_hash: str
    expires_at: datetime


VERIFICATION_TOKEN_HASH_FIELDS = ("verification_token_hash", "verify_token_hash")
VERIFICATION_TOKEN_RAW_FIELDS = ("verification_token", "verify_token")
VERIFICATION_TOKEN_EXPIRY_FIELDS = ("verification_token_expiry", "verify_token_expires_at")
USED_VERIFICATION_TOKEN_HASH_FIELDS = ("last_verification_token_hash", "last_verify_token_hash")


def create_password_reset_token_for_user(user: Any) -> str:
    user_id = getattr(user, "id", None)
    email = getattr(user, "email", None)
    if not email:
        raise ValueError("User must provide email for password reset token generation")
    payload: dict[str, Any] = {"sub": str(email)}
    if user_id is not None:
        payload["user_id"] = int(user_id)
    return create_password_reset_token(payload)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _resolve_domain(email: str) -> str:
    return email.split("@", 1)[1].strip().lower()


def _blocked_domains() -> set[str]:
    return {domain.lower() for domain in DISPOSABLE_EMAIL_DOMAINS}.union(settings.blocked_email_domains_list)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_secure_token() -> str:
    return secrets.token_urlsafe(32)


def _token_fingerprint(token: str | None) -> str | None:
    if not token:
        return None
    return _hash_token(token)[:12]


def _issue_verification_token() -> VerificationTokenRecord:
    token = _generate_secure_token()
    expiry = _utcnow() + timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)
    return VerificationTokenRecord(token=token, token_hash=_hash_token(token), expires_at=expiry)


def _verification_token_storage_fields(record: VerificationTokenRecord) -> dict[str, Any]:
    return {
        "verification_token_hash": record.token_hash,
        "verify_token_hash": record.token_hash,
        "verification_token": None,
        "verify_token": None,
        "verification_token_expiry": record.expires_at,
        "verify_token_expires_at": record.expires_at,
    }


def _clear_verification_token_fields() -> dict[str, Any]:
    return {
        "verification_token_hash": None,
        "verify_token_hash": None,
        "verification_token": None,
        "verify_token": None,
        "verification_token_expiry": None,
        "verify_token_expires_at": None,
    }


def _verification_token_expiry(user: dict[str, Any]) -> datetime | None:
    for field_name in VERIFICATION_TOKEN_EXPIRY_FIELDS:
        expiry = _coerce_utc(user.get(field_name))
        if expiry is not None:
            return expiry
    return None


def _mark_user_verified(user: Any, *, verified_at: datetime | None = None) -> Any:
    timestamp = verified_at or _utcnow()

    for field_name, value in (
        ("is_verified", True),
        ("email_verified_at", timestamp),
        ("verification_token_hash", None),
        ("verify_token_hash", None),
        ("verification_token", None),
        ("verify_token", None),
        ("verification_token_expiry", None),
        ("verify_token_expires_at", None),
    ):
        if hasattr(user, field_name):
            setattr(user, field_name, value)
    return user


def _database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Authentication database is unavailable. Check the MongoDB connection.",
    )


def _serialize_user(document: dict[str, Any]) -> UserResponse:
    return UserResponse.model_validate(user_model(document))


def _parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    return ObjectId(value)


def validate_email_domain(email: str) -> None:
    domain = _resolve_domain(email)
    blocked = _blocked_domains()
    if domain in blocked or any(domain.endswith(f".{blocked_domain}") for blocked_domain in blocked):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please use a valid non-disposable email address",
        )


async def _get_user_by_email(email: str) -> dict[str, Any] | None:
    return await users_collection.find_one({"email": _normalize_email(email)})


async def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    return await users_collection.find_one({"_id": _parse_object_id(user_id)})


async def _find_user_by_verification_token(token: str) -> dict[str, Any] | None:
    token_hash = _hash_token(token)
    for field_name in VERIFICATION_TOKEN_HASH_FIELDS:
        user = await users_collection.find_one({field_name: token_hash})
        if user is not None:
            return user
    for field_name in VERIFICATION_TOKEN_RAW_FIELDS:
        user = await users_collection.find_one({field_name: token})
        if user is not None:
            return user
    return None


async def _find_user_by_consumed_verification_token(token: str) -> dict[str, Any] | None:
    token_hash = _hash_token(token)
    for field_name in USED_VERIFICATION_TOKEN_HASH_FIELDS:
        user = await users_collection.find_one({field_name: token_hash})
        if user is not None:
            return user
    return None


async def _store_verification_token(user_id: ObjectId, *, record: VerificationTokenRecord) -> None:
    await users_collection.update_one(
        {"_id": user_id},
        {
            "$set": {
                **_verification_token_storage_fields(record),
                "is_verified": False,
                "email_verified_at": None,
                "updated_at": _utcnow(),
            }
        },
    )


async def _store_reset_token(user_id: ObjectId, *, token: str) -> None:
    expiry = _utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    await users_collection.update_one(
        {"_id": user_id},
        {
            "$set": {
                "reset_token_hash": _hash_token(token),
                "reset_token_expiry": expiry,
                "updated_at": _utcnow(),
            }
        },
    )


async def _send_verification_email_or_raise(*, recipient_email: str, token: str) -> None:
    try:
        email_result = await send_verification_email_async(recipient_email=recipient_email, token=token)
    except Exception as exc:
        logger.exception("Verification email raised unexpectedly for email=%s", recipient_email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification email",
        ) from exc

    if not email_result.success:
        logger.error("Verification email failed for email=%s error=%s", recipient_email, email_result.error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=email_result.error or "Failed to send verification email",
        )


async def _send_password_reset_email_or_raise(*, recipient_email: str, token: str) -> None:
    try:
        result = await send_password_reset_email_async(recipient_email=recipient_email, token=token)
    except Exception as exc:
        logger.exception("Password reset email raised unexpectedly for email=%s", recipient_email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send password reset email",
        ) from exc

    if not result.success:
        logger.error("Password reset email failed for email=%s error=%s", recipient_email, result.error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.error or "Failed to send password reset email",
        )


async def create_user(payload: SignupRequest) -> SignupResult:
    normalized_email = _normalize_email(str(payload.email))
    validate_email_domain(normalized_email)

    now = _utcnow()
    verification_record = _issue_verification_token()

    document = {
        "email": normalized_email,
        "name": payload.name,
        "hashed_password": hash_password(payload.password),
        "organization_name": _resolve_domain(normalized_email),
        "tier": "FREE",
        "role": USER_ROLE,
        "is_active": True,
        "is_verified": False,
        **_verification_token_storage_fields(verification_record),
        "reset_token_hash": None,
        "reset_token_expiry": None,
        "email_verified_at": None,
        "password_updated_at": now,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
    }

    try:
        existing_user = await _get_user_by_email(normalized_email)
        if existing_user is not None:
            if bool(existing_user.get("is_verified", False)):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

            existing_role = normalize_user_role(existing_user.get("role"))
            await users_collection.update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        **document,
                        "role": ADMIN_ROLE if existing_role == ADMIN_ROLE else USER_ROLE,
                        "created_at": existing_user.get("created_at", now),
                        "name": payload.name or existing_user.get("name"),
                        "organization_name": existing_user.get("organization_name") or document["organization_name"],
                    }
                },
            )
            created_user = await users_collection.find_one({"_id": existing_user["_id"]})
        else:
            result = await users_collection.insert_one(document)
            created_user = await users_collection.find_one({"_id": result.inserted_id})
    except HTTPException:
        raise
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists") from exc
    except PyMongoError as exc:
        logger.exception("Unexpected signup failure for email=%s", normalized_email)
        raise _database_error() from exc

    if created_user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User was created but could not be loaded")

    await _send_verification_email_or_raise(recipient_email=normalized_email, token=verification_record.token)

    logger.info("Signup completed for email=%s", normalized_email)
    return SignupResult(
        user=_serialize_user(created_user),
        verification_token=verification_record.token,
        verification_link=build_verification_link(verification_record.token),
    )


async def authenticate_user(email: str, password: str) -> dict[str, Any]:
    normalized_email = _normalize_email(email)

    try:
        user = await _get_user_by_email(normalized_email)
    except PyMongoError as exc:
        logger.exception("Failed to load user during login email=%s", normalized_email)
        raise _database_error() from exc

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(password, str(user.get("hashed_password", ""))):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    if not bool(user.get("is_verified", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    if not bool(user.get("is_active", True)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    login_time = _utcnow()
    try:
        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": login_time, "updated_at": login_time}},
        )
    except PyMongoError as exc:
        logger.exception("Failed to update login timestamp for email=%s", normalized_email)
        raise _database_error() from exc
    user["last_login_at"] = login_time
    user["updated_at"] = login_time
    logger.info("Login succeeded for email=%s", normalized_email)
    return user


async def verify_email_token_for_user(raw_token: str | None) -> UserResponse:
    token = raw_token.strip() if isinstance(raw_token, str) else ""
    if not token:
        logger.warning("Email verification failed because token was missing")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    try:
        user = await _find_user_by_verification_token(token)
    except PyMongoError as exc:
        logger.exception("Verification lookup failed")
        raise _database_error() from exc

    if user is None:
        try:
            consumed_user = await _find_user_by_consumed_verification_token(token)
        except PyMongoError as exc:
            logger.exception("Consumed verification-token lookup failed")
            raise _database_error() from exc

        if consumed_user is not None and bool(consumed_user.get("is_verified", False)):
            logger.info(
                "Verification token already consumed for email=%s token_fingerprint=%s",
                consumed_user.get("email"),
                _token_fingerprint(token),
            )
            return _serialize_user(consumed_user)

        logger.warning("Email verification failed because token was not found token_fingerprint=%s", _token_fingerprint(token))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    expiry = _verification_token_expiry(user)
    if expiry is None or expiry <= _utcnow():
        try:
            await users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": {**_clear_verification_token_fields(), "updated_at": _utcnow()}},
            )
        except PyMongoError as exc:
            logger.exception("Failed to clear expired verification token for email=%s", user.get("email"))
            raise _database_error() from exc
        logger.warning(
            "Email verification link expired for email=%s token_fingerprint=%s",
            user.get("email"),
            _token_fingerprint(token),
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link expired")

    verified_at = _utcnow()
    try:
        await users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "is_verified": True,
                    "email_verified_at": verified_at,
                    "last_verification_token_hash": _hash_token(token),
                    "last_verify_token_hash": _hash_token(token),
                    "last_verification_token_verified_at": verified_at,
                    **_clear_verification_token_fields(),
                    "updated_at": verified_at,
                }
            },
        )
        updated_user = await users_collection.find_one({"_id": user["_id"]})
    except PyMongoError as exc:
        logger.exception("Failed to mark email verified for email=%s", user.get("email"))
        raise _database_error() from exc
    if updated_user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Verified user could not be loaded")

    logger.info(
        "Email verified for email=%s token_fingerprint=%s",
        updated_user["email"],
        _token_fingerprint(token),
    )
    return _serialize_user(updated_user)


async def resend_verification_email(email: str) -> ResendVerificationResult:
    normalized_email = _normalize_email(email)
    generic_message = "If the account exists and still needs verification, a new verification email has been sent."
    try:
        user = await _get_user_by_email(normalized_email)
    except PyMongoError as exc:
        logger.exception("Failed to load user during resend verification email=%s", normalized_email)
        raise _database_error() from exc
    if user is None or not bool(user.get("is_active", True)):
        logger.info("Resend verification requested for missing/inactive email=%s", normalized_email)
        return ResendVerificationResult(message=generic_message, email_sent=False)

    if bool(user.get("is_verified", False)):
        return ResendVerificationResult(message="Your email is already verified. Please sign in.", email_sent=False)

    verification_record = _issue_verification_token()
    try:
        await _store_verification_token(user["_id"], record=verification_record)
    except PyMongoError as exc:
        logger.exception("Failed to store resend verification token for email=%s", normalized_email)
        raise _database_error() from exc
    await _send_verification_email_or_raise(recipient_email=normalized_email, token=verification_record.token)

    return ResendVerificationResult(message="A new verification email has been sent.", email_sent=True)


async def issue_password_reset_token(email: str, *, return_token: bool = False) -> PasswordResetIssueResult:
    normalized_email = _normalize_email(email)
    try:
        user = await _get_user_by_email(normalized_email)
    except PyMongoError as exc:
        logger.exception("Failed to load user during password reset email=%s", normalized_email)
        raise _database_error() from exc
    if user is None or not bool(user.get("is_active", True)) or not bool(user.get("is_verified", False)):
        logger.info("Password reset requested for unavailable email=%s", normalized_email)
        return PasswordResetIssueResult(email_sent=False)

    token = _generate_secure_token()
    try:
        await _store_reset_token(user["_id"], token=token)
    except PyMongoError as exc:
        logger.exception("Failed to store password reset token for email=%s", normalized_email)
        raise _database_error() from exc
    await _send_password_reset_email_or_raise(recipient_email=normalized_email, token=token)

    return PasswordResetIssueResult(
        email_sent=True,
        reset_token=token if return_token else None,
        reset_link=build_reset_password_link(token) if return_token else None,
    )


async def reset_password_for_user(raw_token: str, new_password: str) -> UserResponse:
    token = raw_token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    try:
        user = await users_collection.find_one({"reset_token_hash": _hash_token(token)})
    except PyMongoError as exc:
        logger.exception("Password reset lookup failed")
        raise _database_error() from exc
    if user is None:
        logger.warning("Password reset failed because token was not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    expiry = _coerce_utc(user.get("reset_token_expiry"))
    if expiry is None or expiry <= _utcnow():
        try:
            await users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": {"reset_token_hash": None, "reset_token_expiry": None, "updated_at": _utcnow()}},
            )
        except PyMongoError as exc:
            logger.exception("Failed to clear expired reset token for email=%s", user.get("email"))
            raise _database_error() from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    updated_at = _utcnow()
    try:
        await users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "hashed_password": hash_password(new_password),
                    "password_updated_at": updated_at,
                    "reset_token_hash": None,
                    "reset_token_expiry": None,
                    "updated_at": updated_at,
                }
            },
        )
        updated_user = await users_collection.find_one({"_id": user["_id"]})
        await revoke_all_refresh_sessions_for_user(user_id=str(user["_id"]), reason="password_reset")
    except PyMongoError as exc:
        logger.exception("Failed to update password for email=%s", user.get("email"))
        raise _database_error() from exc
    if updated_user is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Password reset completed but user could not be loaded")

    logger.info("Password reset completed for email=%s", updated_user["email"])
    return _serialize_user(updated_user)
