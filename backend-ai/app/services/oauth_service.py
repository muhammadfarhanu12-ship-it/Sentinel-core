from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRoleEnum
from app.services.auth_service import _mark_user_verified
from app.utils.hashing import get_password_hash
from app.utils.token_generator import create_access_token, create_refresh_token

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OAuthProviderConfig:
    name: str
    display_name: str
    authorize_url: str
    token_url: str
    scopes: tuple[str, ...]
    client_id: str | None
    client_secret: str | None


@dataclass(slots=True)
class OAuthIdentity:
    provider: str
    subject: str
    email: str
    email_verified: bool
    name: str | None = None


@dataclass(slots=True)
class OAuthTokenBundle:
    access_token: str
    refresh_token: str
    user: User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _resolve_domain(email: str) -> str:
    return email.split("@", 1)[1].strip().lower()


def _split_scopes(raw_scopes: str) -> tuple[str, ...]:
    return tuple(scope.strip() for scope in raw_scopes.replace(",", " ").split() if scope.strip())


def _oauth_provider_registry() -> dict[str, OAuthProviderConfig]:
    return {
        "google": OAuthProviderConfig(
            name="google",
            display_name="Google",
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            scopes=_split_scopes(settings.GOOGLE_OAUTH_SCOPES),
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        ),
        "github": OAuthProviderConfig(
            name="github",
            display_name="GitHub",
            authorize_url="https://github.com/login/oauth/authorize",
            token_url="https://github.com/login/oauth/access_token",
            scopes=_split_scopes(settings.GITHUB_OAUTH_SCOPES),
            client_id=settings.GITHUB_OAUTH_CLIENT_ID,
            client_secret=settings.GITHUB_OAUTH_CLIENT_SECRET,
        ),
        "facebook": OAuthProviderConfig(
            name="facebook",
            display_name="Facebook",
            authorize_url="https://www.facebook.com/v19.0/dialog/oauth",
            token_url="https://graph.facebook.com/v19.0/oauth/access_token",
            scopes=_split_scopes(settings.FACEBOOK_OAUTH_SCOPES),
            client_id=settings.FACEBOOK_OAUTH_CLIENT_ID,
            client_secret=settings.FACEBOOK_OAUTH_CLIENT_SECRET,
        ),
    }


def get_oauth_provider_config(provider: str) -> OAuthProviderConfig:
    config = _oauth_provider_registry().get(provider)
    if config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAuth provider is not supported")
    if not config.client_id or not config.client_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"{config.display_name} OAuth is not configured")
    return config


def _frontend_callback_base() -> str:
    frontend_base = settings.FRONTEND_URL.rstrip("/")
    callback_path = settings.OAUTH_FRONTEND_CALLBACK_PATH.strip() or "/oauth/callback"
    return f"{frontend_base}/{callback_path.lstrip('/')}"


def _provider_callback_url(provider: str) -> str:
    backend_base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    return f"{backend_base}/api/auth/{provider}/callback"


def build_oauth_error_redirect(provider: str, message: str) -> str:
    fragment = urlencode(
        {
            "error": "oauth_error",
            "provider": provider,
            "message": message,
        }
    )
    return f"{_frontend_callback_base()}#{fragment}"


def _create_oauth_state_token(provider: str) -> str:
    now = _utcnow()
    payload = {
        "sub": provider,
        "provider": provider,
        "type": "oauth_state",
        "exp": now + timedelta(minutes=settings.OAUTH_STATE_EXPIRE_MINUTES),
        "iat": now,
        "nbf": now,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode_oauth_state_token(provider: str, token: str | None) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state") from exc

    if payload.get("type") != "oauth_state" or payload.get("provider") != provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")
    return payload


def build_oauth_login_url(provider: str) -> str:
    config = get_oauth_provider_config(provider)
    state = _create_oauth_state_token(provider)
    params = {
        "client_id": config.client_id,
        "redirect_uri": _provider_callback_url(provider),
        "response_type": "code",
        "scope": " ".join(config.scopes),
        "state": state,
    }
    if provider == "google":
        params["access_type"] = "offline"
        params["prompt"] = "consent"

    return f"{config.authorize_url}?{urlencode(params)}"


async def _exchange_code_for_tokens(client: httpx.AsyncClient, config: OAuthProviderConfig, code: str) -> dict[str, Any]:
    redirect_uri = _provider_callback_url(config.name)
    if config.name == "facebook":
        response = await client.get(
            config.token_url,
            params={
                "client_id": config.client_id,
                "client_secret": config.client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
    else:
        response = await client.post(
            config.token_url,
            data={
                "client_id": config.client_id,
                "client_secret": config.client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )

    payload = response.json()
    if response.status_code >= 400 or "error" in payload:
        logger.warning("OAuth token exchange failed provider=%s payload=%s", config.name, payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{config.display_name} login failed")
    return payload


async def _fetch_google_identity(client: httpx.AsyncClient, access_token: str) -> OAuthIdentity:
    response = await client.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    payload = response.json()
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google login failed")
    email = _normalize_email(str(payload.get("email") or ""))
    if not email or not bool(payload.get("email_verified")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account email is not verified")
    return OAuthIdentity(
        provider="google",
        subject=str(payload.get("sub") or ""),
        email=email,
        email_verified=True,
        name=str(payload.get("name") or "") or None,
    )


async def _fetch_github_identity(client: httpx.AsyncClient, access_token: str) -> OAuthIdentity:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    user_response = await client.get("https://api.github.com/user", headers=headers)
    user_payload = user_response.json()
    if user_response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub login failed")

    email = _normalize_email(str(user_payload.get("email") or ""))
    if not email:
        emails_response = await client.get("https://api.github.com/user/emails", headers=headers)
        emails_payload = emails_response.json()
        if emails_response.status_code >= 400 or not isinstance(emails_payload, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub account email is unavailable")
        verified_candidates = [
            item for item in emails_payload if item.get("verified") and item.get("email")
        ]
        primary_candidate = next((item for item in verified_candidates if item.get("primary")), None)
        chosen = primary_candidate or (verified_candidates[0] if verified_candidates else None)
        if chosen is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub account email must be verified")
        email = _normalize_email(str(chosen.get("email") or ""))

    return OAuthIdentity(
        provider="github",
        subject=str(user_payload.get("id") or ""),
        email=email,
        email_verified=True,
        name=str(user_payload.get("name") or user_payload.get("login") or "") or None,
    )


async def _fetch_facebook_identity(client: httpx.AsyncClient, access_token: str) -> OAuthIdentity:
    response = await client.get(
        "https://graph.facebook.com/me",
        params={
            "fields": "id,name,email",
            "access_token": access_token,
        },
    )
    payload = response.json()
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Facebook login failed")
    email = _normalize_email(str(payload.get("email") or ""))
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Facebook account email is unavailable")
    return OAuthIdentity(
        provider="facebook",
        subject=str(payload.get("id") or ""),
        email=email,
        email_verified=True,
        name=str(payload.get("name") or "") or None,
    )


async def exchange_code_for_identity(provider: str, code: str) -> OAuthIdentity:
    config = get_oauth_provider_config(provider)
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_payload = await _exchange_code_for_tokens(client, config, code)
        access_token = str(token_payload.get("access_token") or "")
        if not access_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{config.display_name} login failed")

        if provider == "google":
            return await _fetch_google_identity(client, access_token)
        if provider == "github":
            return await _fetch_github_identity(client, access_token)
        if provider == "facebook":
            return await _fetch_facebook_identity(client, access_token)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OAuth provider is not supported")


def _upsert_oauth_user(db: Session, identity: OAuthIdentity) -> User:
    normalized_email = _normalize_email(identity.email)
    now = _utcnow()

    user = (
        db.query(User)
        .filter(User.oauth_provider == identity.provider, User.oauth_subject == identity.subject)
        .first()
    )
    if user is None:
        user = db.query(User).filter(User.email == normalized_email).first()
        if (
            user is not None
            and user.oauth_provider
            and user.oauth_subject
            and (user.oauth_provider != identity.provider or user.oauth_subject != identity.subject)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already linked to a different social login provider.",
            )

    if user is None:
        user = User(
            email=normalized_email,
            hashed_password=get_password_hash(secrets.token_urlsafe(48)),
            organization_name=_resolve_domain(normalized_email),
            role=UserRoleEnum.ANALYST,
            is_active=True,
            is_verified=True,
            password_updated_at=now,
            email_verified_at=now,
        )

    user.email = normalized_email
    user.organization_name = user.organization_name or _resolve_domain(normalized_email)
    user.is_active = True
    user.oauth_provider = identity.provider
    user.oauth_subject = identity.subject
    _mark_user_verified(user, verified_at=now)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


async def finalize_oauth_login_async(db: Session, provider: str, code: str, state_token: str | None) -> OAuthTokenBundle:
    _decode_oauth_state_token(provider, state_token)
    identity = await exchange_code_for_identity(provider, code)
    if not identity.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{provider.title()} account email must be verified")
    user = _upsert_oauth_user(db, identity)
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id, "auth_provider": provider})
    refresh_token = create_refresh_token(data={"sub": user.email, "user_id": user.id, "auth_provider": provider})
    logger.info("OAuth login succeeded provider=%s email=%s user_id=%s", provider, user.email, user.id)
    return OAuthTokenBundle(access_token=access_token, refresh_token=refresh_token, user=user)


def build_oauth_success_redirect(provider: str, bundle: OAuthTokenBundle) -> str:
    fragment = urlencode(
        {
            "provider": provider,
            "access_token": bundle.access_token,
            "refresh_token": bundle.refresh_token,
            "email": bundle.user.email,
        }
    )
    return f"{_frontend_callback_base()}#{fragment}"
