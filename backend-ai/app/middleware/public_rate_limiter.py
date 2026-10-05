"""Shared public-endpoint limits, with Mongo-backed counters in production."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import math
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.db.mongo import get_collection
from app.middleware import rate_limiter

logger = logging.getLogger(__name__)
PUBLIC_RATE_LIMIT_COLLECTION = "public_rate_limits"


def public_client_identifier(request: Request) -> str:
    # Uvicorn must resolve headers only from explicitly trusted proxy peers.
    # Reading the raw X-Forwarded-For here would let a caller choose its bucket.
    return request.client.host if request.client else "unknown"


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Request protection is temporarily unavailable. Please try again shortly.",
        headers={"Retry-After": "5"},
    )


async def check_public_rate_limit(
    identifier: str,
    scope: str,
    limit: int,
    window_seconds: int,
    request: Request,
) -> None:
    """Consume one attempt before CAPTCHA verification or other side effects.

    Mongo uses one atomic update per identifier, with a window beginning on
    the first attempt. Its own clock controls expiry across application workers;
    the TTL index only cleans storage and is not used to decide authorization.
    """
    if limit < 1 or window_seconds < 1:
        raise ValueError("Public rate limits must have positive limits and windows")

    backend = str(getattr(settings, "PUBLIC_RATE_LIMIT_BACKEND", "mongo" if settings.is_production else "memory")).lower()
    if backend == "memory" and not settings.is_production:
        rate_limiter.check_rate_limit(identifier, scope=scope, limit=limit, window_seconds=window_seconds)
        return
    if backend != "mongo":
        # Runtime guard as well as startup validation: production never silently
        # falls back to independent per-process limits or permits an unknown mode.
        raise _unavailable()

    # Do not retain raw IP addresses or email addresses in this collection.
    # The existing server-only key also prevents offline guessing of email hashes.
    bucket_id = hmac.new(
        settings.API_KEY_SECRET.encode("utf-8"),
        f"{scope}\0{window_seconds}\0{identifier}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    expired = {"$lte": [{"$ifNull": ["$expires_at", datetime(1970, 1, 1, tzinfo=timezone.utc)]}, "$$NOW"]}
    update = [{"$set": {
        "count": {"$cond": [expired, 1, {"$add": ["$count", 1]}]},
        "expires_at": {"$cond": [expired, {"$add": ["$$NOW", window_seconds * 1000]}, "$expires_at"]},
        "checked_at": "$$NOW",
    }}]

    async def consume() -> dict:
        collection = get_collection(PUBLIC_RATE_LIMIT_COLLECTION, request=request)
        try:
            result = await collection.find_one_and_update(
                {"_id": bucket_id}, update, upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            # Simultaneous first attempts can race to upsert the same unique _id.
            # Retry as an update so each attempt still increments exactly once.
            result = await collection.find_one_and_update(
                {"_id": bucket_id}, update, upsert=False, return_document=ReturnDocument.AFTER,
            )
        if not isinstance(result, dict):
            raise RuntimeError("Public rate limiter did not return a counter")
        return result

    try:
        timeout = max(0.1, float(getattr(settings, "PUBLIC_RATE_LIMIT_TIMEOUT_SECONDS", 3.0)))
        counter = await asyncio.wait_for(consume(), timeout=timeout)
        count = int(counter["count"])
        expires_at = counter["expires_at"]
        checked_at = counter["checked_at"]
        if count < 1 or not isinstance(expires_at, datetime) or not isinstance(checked_at, datetime):
            raise ValueError("Invalid public rate limiter counter")
        retry_after = max(1, math.ceil((expires_at - checked_at).total_seconds()))
    except Exception as exc:
        # Log only exception type: database driver messages may include connection
        # details, and request identifiers can contain personal data.
        logger.warning("Public rate limiter unavailable scope=%s error_type=%s", scope, type(exc).__name__)
        raise _unavailable() from exc

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
