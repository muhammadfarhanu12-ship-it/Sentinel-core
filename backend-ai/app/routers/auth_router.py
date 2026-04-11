from datetime import timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth_middleware import decode_token, get_current_user
from app.middleware.rate_limiter import check_rate_limit
from app.models.user import User
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.auth_schema import (
    ForgotPasswordRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TestAuthFlowRequest,
    Token,
    VerifyEmailRequest,
)
from app.schemas.user_schema import UserCreate, UserResponse
from app.services.audit_service import log_login_attempt
from app.services.auth_service import (
    authenticate_user,
    create_user,
    issue_password_reset_token,
    resend_verification_email,
    reset_password_for_user,
    run_test_auth_flow,
    verify_email_token_for_user,
)
from app.services.oauth_service import (
    build_oauth_error_redirect,
    build_oauth_login_url,
    build_oauth_success_redirect,
    finalize_oauth_login_async,
)
from app.utils.token_generator import create_access_token, create_refresh_token

router = APIRouter(prefix="/auth", tags=["auth"])
test_router = APIRouter(tags=["auth"])
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


async def _verify_email(token: str | None, db: Session) -> ApiResponse[dict]:
    if settings.AUTH_DEBUG_TOKEN_LOGGING:
        logger.info("Verify email request received token=%s", token)
    user = verify_email_token_for_user(db, token)
    return ok({"message": "Email verified successfully", "email": user.email})


@router.post("/signup", response_model=ApiResponse[dict])
async def signup(user: UserCreate, request: Request, db: Session = Depends(get_db)):
    _apply_auth_rate_limit(request=request, scope="auth_signup", email=user.email, limit=5, window_seconds=900)
    signup_result = await create_user(db=db, user=user)
    return ok(
        {
            "message": "Check your email for a verification link.",
            "email": signup_result.user.email,
        }
    )


@router.post("/login", response_model=ApiResponse[Token])
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    normalized_email = _normalize_email(form_data.username)
    _apply_auth_rate_limit(request=request, scope="auth_login", email=normalized_email, limit=10, window_seconds=900)

    try:
        user = authenticate_user(db, normalized_email, form_data.password)
    except HTTPException:
        log_login_attempt(normalized_email, False, _client_identifier(request))
        raise

    if not user:
        log_login_attempt(normalized_email, False, _client_identifier(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id},
        expires_delta=access_token_expires,
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "user_id": user.id})
    log_login_attempt(user.email, True, _client_identifier(request))
    return ok({"access_token": access_token, "token_type": "bearer", "refresh_token": refresh_token})


@router.post("/refresh", response_model=ApiResponse[Token])
async def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    token_data = decode_token(payload.refresh_token, expected_type="refresh")
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None or user.email != token_data.email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not bool(user.is_active):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    if not bool(user.is_verified):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email first")

    token_payload = {"sub": user.email, "user_id": user.id}
    access_token = create_access_token(data=token_payload)
    refresh_token_value = create_refresh_token(data=token_payload)
    return ok({"access_token": access_token, "token_type": "bearer", "refresh_token": refresh_token_value})


@router.post("/forgot-password", response_model=ApiResponse[dict])
async def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    _apply_auth_rate_limit(request=request, scope="auth_forgot_password", email=payload.email, limit=5, window_seconds=900)
    await issue_password_reset_token(db, payload.email)
    return ok({"message": "If the account exists, a password reset link has been sent."})


@router.post("/resend-verification", response_model=ApiResponse[dict])
async def resend_verification(payload: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    _apply_auth_rate_limit(request=request, scope="auth_resend_verification", email=payload.email, limit=1, window_seconds=60)
    result = await resend_verification_email(db, payload.email)
    return ok({"message": result.message, "email_sent": result.email_sent})


@router.get("/verify-email", response_model=ApiResponse[dict])
async def verify_email_get(token: str | None = Query(default=None), db: Session = Depends(get_db)):
    return await _verify_email(token, db)


@router.post("/verify-email", response_model=ApiResponse[dict])
async def verify_email_post(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    return await _verify_email(payload.token, db)


@router.post("/reset-password", response_model=ApiResponse[dict])
async def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    validated = UserCreate(email="reset@example.com", password=payload.new_password)
    _ = validated
    reset_password_for_user(db, payload.token, payload.new_password)
    return ok({"message": "Password reset completed successfully."})


@router.get("/me", response_model=ApiResponse[UserResponse])
async def read_auth_me(current_user: User = Depends(get_current_user)):
    return ok(current_user)


@router.get("/{provider}/login", include_in_schema=False)
async def oauth_login(provider: str):
    try:
        return RedirectResponse(build_oauth_login_url(provider), status_code=status.HTTP_302_FOUND)
    except HTTPException as exc:
        return RedirectResponse(build_oauth_error_redirect(provider, str(exc.detail)), status_code=status.HTTP_302_FOUND)


@router.get("/{provider}/callback", include_in_schema=False)
async def oauth_callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if error:
        return RedirectResponse(
            build_oauth_error_redirect(provider, f"{provider.title()} login was cancelled or denied."),
            status_code=status.HTTP_302_FOUND,
        )
    if not code:
        return RedirectResponse(
            build_oauth_error_redirect(provider, "Missing OAuth authorization code."),
            status_code=status.HTTP_302_FOUND,
        )
    try:
        bundle = await finalize_oauth_login_async(db, provider, code, state)
        return RedirectResponse(build_oauth_success_redirect(provider, bundle), status_code=status.HTTP_302_FOUND)
    except HTTPException as exc:
        return RedirectResponse(build_oauth_error_redirect(provider, str(exc.detail)), status_code=status.HTTP_302_FOUND)


@test_router.post("/test-auth-flow", response_model=ApiResponse[dict])
async def test_auth_flow(payload: TestAuthFlowRequest, request: Request, db: Session = Depends(get_db)):
    _apply_auth_rate_limit(request=request, scope="auth_test_flow", email=payload.email, limit=2, window_seconds=300)
    result = await run_test_auth_flow(db, UserCreate(email=payload.email, password=payload.password))

    access_token = create_access_token(
        data={"sub": str(result["email"]), "user_id": int(result["user_id"])},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return ok(
        {
            **result,
            "access_token": access_token,
            "token_type": "bearer",
        }
    )
