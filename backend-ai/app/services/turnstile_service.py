"""Cloudflare Siteverify is the authority; no local CAPTCHA acceptance path."""
from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)
SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: object, *, action: str) -> None:
    if not isinstance(token, str) or not token.strip() or len(token) > 2048:
        raise HTTPException(400, "Please complete the security verification and try again.")
    if not settings.TURNSTILE_SECRET_KEY or not settings.turnstile_allowed_hostnames:
        logger.error("Turnstile server configuration is incomplete")
        raise HTTPException(503, "Security verification is unavailable. Please try again later.")

    try:
        # A total deadline also bounds slow responses. Never retry a single-use token
        # automatically, or send tokens/credentials to a redirect destination.
        async with asyncio.timeout(settings.TURNSTILE_TIMEOUT_SECONDS):
            async with httpx.AsyncClient(timeout=settings.TURNSTILE_TIMEOUT_SECONDS, follow_redirects=False) as client:
                response = await client.post(
                    SITEVERIFY_URL,
                    data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token},
                )
                response.raise_for_status()
                result = response.json()
        if not isinstance(result, dict) or not isinstance(result.get("success"), bool):
            raise ValueError("Malformed verification response")
    except (httpx.HTTPError, ValueError, TimeoutError):
        # Do not log the request, response body, exception or secret/token.
        logger.warning("Turnstile verification service unavailable action=%s", action)
        raise HTTPException(503, "Security verification is unavailable. Please try again later.") from None

    if result["success"] is not True:
        codes = result.get("error-codes")
        if isinstance(codes, list) and any(
            code in {"missing-input-secret", "invalid-input-secret", "internal-error"}
            for code in codes if isinstance(code, str)
        ):
            raise HTTPException(503, "Security verification is unavailable. Please try again later.")
        raise HTTPException(400, "Security verification failed or expired. Please complete it again.")

    hostname = result.get("hostname")
    if (
        not isinstance(hostname, str)
        or hostname.lower().rstrip(".") not in settings.turnstile_allowed_hostnames
        or result.get("action") != action
    ):
        raise HTTPException(400, "Security verification failed. Please complete it again.")
