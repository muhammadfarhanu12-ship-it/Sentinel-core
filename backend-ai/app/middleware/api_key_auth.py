from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.api_key import APIKey, KeyStatusEnum
from app.services.api_key_service import find_api_key_by_raw_key


def require_api_key(
    request: Request,
    db: Session = Depends(get_db),
) -> APIKey | None:
    raw_key = (request.headers.get("x-api-key") or "").strip()
    if not raw_key:
        if settings.ENABLE_DEMO_MODE:
            return None
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing x-api-key header")

    api_key = find_api_key_by_raw_key(db, raw_key, include_revoked=True)
    if api_key is None:
        if settings.ENABLE_DEMO_MODE and raw_key == settings.TEST_API_KEY:
            return None
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing x-api-key header")
    if api_key.status != KeyStatusEnum.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key is not active")

    request.state.api_key = api_key
    return api_key
