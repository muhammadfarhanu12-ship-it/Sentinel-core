from __future__ import annotations

import hashlib
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError

from app.middleware.auth_middleware import decode_token, get_current_user
from app.middleware.rate_limiter import check_rate_limit
from app.models.user_model import user_model
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.auth_schema import (
    ForgotPasswordRequest,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    Token,
    VerifyEmailRequest,
)
from app.schemas.user_schema import LoginRequest, SignupRequest, UserResponse
from app.services.auth_service import (
    authenticate_user,
    create_user,
    get_user_by_id,
    issue_password_reset_token,
    resend_verification_email,
    reset_password_for_user,
    verify_email_token_for_user,
)
from app.services.session_service import (
    create_refresh_session,
    revoke_refresh_session,
    rotate_refresh_session,
)
from app.utils.token_generator import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _client_identifier(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _apply_auth_rate_limit(*, request: Request, scope: str, email: str | None = None, limit: int, window_seconds: int) -> None:
    client_id = _client_identifier(request)
    check_rate_limit(client_id, scope=f"{scope}:ip", limit=limit, window_seconds=window_seconds)
    if email:
        check_rate_limit(_normalize_email(email), scope=f"{scope}:email", limit=limit, window_seconds=window_seconds)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _token_fingerprint(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _sanitize_auth_field(field_name: str, value: Any) -> Any:
    if value is None:
        return None

    normalized_name = field_name.lower()
    if "password" in normalized_name:
        return {
            "present": True,
            "length": len(str(value)),
        }
    if "token" in normalized_name:
        token_value = str(value)
        return {
            "present": True,
            "length": len(token_value),
            "fingerprint": _token_fingerprint(token_value),
        }
    if "email" in normalized_name:
        return _normalize_email(str(value))
    return value


def _log_auth_payload(request: Request, action: str, payload: dict[str, Any]) -> None:
    sanitized_payload = {
        field_name: _sanitize_auth_field(field_name, value)
        for field_name, value in payload.items()
    }
    logger.info(
        "Auth payload action=%s request_id=%s payload=%s",
        action,
        _request_id(request),
        sanitized_payload,
    )


async def _build_token_response(*, user: UserResponse, extra_claims: dict | None = None) -> Token:
    token_payload = {"sub": user.email, "user_id": user.id, **(extra_claims or {})}
    access_token = create_access_token(data=token_payload)
    refresh_token = await create_refresh_session(user_id=user.id, email=user.email, extra_claims=extra_claims)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=user,
    )


async def _extract_login_payload(request: Request) -> LoginRequest:
    content_type = request.headers.get("content-type", "").lower()
    try:
        if "application/json" in content_type:
            payload = await request.json()
            return LoginRequest.model_validate(payload)

        form = await request.form()
        return LoginRequest.model_validate(
            {
                "email": form.get("username") or form.get("email") or "",
                "password": form.get("password") or "",
            }
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


@router.post("/signup", response_model=ApiResponse[MessageResponse], status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, request: Request):
    logger.info("Signup requested request_id=%s email=%s", _request_id(request), str(payload.email).lower())
    _log_auth_payload(
        request,
        "signup",
        {
            "email": payload.email,
            "name_present": bool(payload.name),
            "password": payload.password,
        },
    )
    _apply_auth_rate_limit(request=request, scope="auth_signup", email=str(payload.email), limit=5, window_seconds=900)
    try:
        signup_result = await create_user(payload)
        logger.info("Signup completed request_id=%s email=%s", _request_id(request), signup_result.user.email)
        return ok(
            MessageResponse(
                message="Verification email sent successfully.",
                email=signup_result.user.email,
                email_sent=True,
            )
        )
    except Exception:
        logger.exception("Signup failed request_id=%s email=%s", _request_id(request), str(payload.email).lower())
        raise


@router.post("/login", response_model=ApiResponse[Token])
async def login(request: Request):
    login_payload = await _extract_login_payload(request)
    normalized_email = _normalize_email(str(login_payload.email))
    logger.info("Login requested request_id=%s email=%s", _request_id(request), normalized_email)
    _log_auth_payload(
        request,
        "login",
        {
            "email": normalized_email,
            "password": login_payload.password,
            "content_type": request.headers.get("content-type", ""),
        },
    )
    _apply_auth_rate_limit(request=request, scope="auth_login", email=normalized_email, limit=10, window_seconds=900)
    try:
        user = await authenticate_user(normalized_email, login_payload.password)
        serialized_user = UserResponse.model_validate(user_model(user))
        logger.info("Login succeeded request_id=%s email=%s", _request_id(request), normalized_email)
        return ok(await _build_token_response(user=serialized_user))
    except Exception:
        logger.exception("Login failed request_id=%s email=%s", _request_id(request), normalized_email)
        raise


@router.post("/refresh", response_model=ApiResponse[Token])
async def refresh_token(payload: RefreshTokenRequest, request: Request):
    logger.info("Refresh token requested request_id=%s", _request_id(request))
    _log_auth_payload(request, "refresh", payload.model_dump())
    _apply_auth_rate_limit(request=request, scope="auth_refresh", limit=20, window_seconds=300)
    try:
        token_data = decode_token(payload.refresh_token, expected_type="refresh")
        user = await get_user_by_id(str(token_data.user_id))
        if user is None or str(user.get("email", "")).lower() != str(token_data.email).lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not bool(user.get("is_active", True)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
        if not bool(user.get("is_verified", False)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")

        serialized_user = UserResponse.model_validate(user_model(user))
        refresh_token = await rotate_refresh_session(token_data, user_id=serialized_user.id, email=serialized_user.email)
        access_token = create_access_token(data={"sub": serialized_user.email, "user_id": serialized_user.id})
        return ok(Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer", user=serialized_user))
    except Exception:
        logger.exception("Refresh token failed request_id=%s", _request_id(request))
        raise


@router.post("/logout", response_model=ApiResponse[MessageResponse])
async def logout(payload: LogoutRequest | None = None):
    if payload is not None:
        logger.info(
            "Logout requested refresh_token_present=%s refresh_token_fingerprint=%s",
            bool(payload.refresh_token),
            _token_fingerprint(payload.refresh_token),
        )
    if payload and payload.refresh_token:
        try:
            token_data = decode_token(payload.refresh_token, expected_type="refresh")
            await revoke_refresh_session(token_data, reason="logout")
        except HTTPException:
            logger.info("Logout received an invalid or expired refresh token; returning success anyway")

    return ok(MessageResponse(message="Logged out successfully."))


@router.post("/forgot-password", response_model=ApiResponse[MessageResponse])
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    logger.info("Forgot-password requested request_id=%s email=%s", _request_id(request), str(payload.email).lower())
    _log_auth_payload(request, "forgot_password", payload.model_dump())
    _apply_auth_rate_limit(request=request, scope="auth_forgot_password", email=str(payload.email), limit=5, window_seconds=900)
    await issue_password_reset_token(str(payload.email))
    return ok(MessageResponse(message="If an account exists, a password reset email has been sent."))


@router.post("/resend-verification", response_model=ApiResponse[MessageResponse])
async def resend_verification(payload: ResendVerificationRequest, request: Request):
    logger.info("Resend verification requested request_id=%s email=%s", _request_id(request), str(payload.email).lower())
    _log_auth_payload(request, "resend_verification", payload.model_dump())
    _apply_auth_rate_limit(request=request, scope="auth_resend_verification", email=str(payload.email), limit=1, window_seconds=60)
    result = await resend_verification_email(str(payload.email))
    return ok(MessageResponse(message=result.message, email=str(payload.email), email_sent=result.email_sent))


@router.get("/verify-email", response_model=ApiResponse[MessageResponse])
async def verify_email_get(request: Request, token: str | None = Query(default=None)):
    logger.info("Verify-email GET requested request_id=%s has_token=%s", _request_id(request), bool(token))
    _log_auth_payload(request, "verify_email_get", {"token": token})
    _apply_auth_rate_limit(request=request, scope="auth_verify_email", limit=10, window_seconds=900)
    user = await verify_email_token_for_user(token)
    return ok(MessageResponse(message="Email verified successfully.", email=user.email, email_sent=True))


@router.post("/verify-email", response_model=ApiResponse[MessageResponse])
async def verify_email_post(payload: VerifyEmailRequest, request: Request):
    logger.info("Verify-email POST requested request_id=%s has_token=%s", _request_id(request), bool(payload.token))
    _log_auth_payload(request, "verify_email_post", payload.model_dump())
    _apply_auth_rate_limit(request=request, scope="auth_verify_email", limit=10, window_seconds=900)
    user = await verify_email_token_for_user(payload.token)
    return ok(MessageResponse(message="Email verified successfully.", email=user.email, email_sent=True))


@router.post("/reset-password", response_model=ApiResponse[MessageResponse])
async def reset_password(payload: ResetPasswordRequest, request: Request):
    logger.info("Reset-password requested request_id=%s has_token=%s", _request_id(request), bool(payload.token))
    _log_auth_payload(request, "reset_password", payload.model_dump())
    _apply_auth_rate_limit(request=request, scope="auth_reset_password", limit=10, window_seconds=900)
    await reset_password_for_user(payload.token, payload.new_password)
    return ok(MessageResponse(message="Password reset completed successfully."))


@router.get("/me", response_model=ApiResponse[UserResponse])
async def read_auth_me(current_user: dict = Depends(get_current_user)):
    return ok(UserResponse.model_validate(user_model(current_user)))
