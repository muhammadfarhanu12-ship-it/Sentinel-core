import re
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.user import User
from app.schemas.api_key_schema import APIKeyCreate
from app.services.audit_service import (
    log_api_key_creation,
    log_api_key_revoked,
    log_api_key_used,
)
from app.utils.api_key_generator import generate_api_key
from app.utils.hashing import get_password_hash, verify_password

API_KEY_PREFIX_LEN = 12
API_KEY_PATTERN = re.compile(r"^sentinel_sk_(?:live|test)_[A-Za-z0-9]{32}$")


def extract_api_key_prefix(raw_key: str) -> str | None:
    if not raw_key or len(raw_key) < API_KEY_PREFIX_LEN:
        return None
    return raw_key[:API_KEY_PREFIX_LEN]


def is_valid_api_key_format(raw_key: str) -> bool:
    # Allow a non-regex demo key only when demo mode is enabled.
    if settings.ENABLE_DEMO_MODE and secrets.compare_digest(raw_key, settings.TEST_API_KEY):
        return True
    return bool(API_KEY_PATTERN.match(raw_key))


def create_api_key(db: Session, user_id: int, key_in: APIKeyCreate) -> tuple[APIKey, str]:
    raw_key = generate_api_key()
    prefix = extract_api_key_prefix(raw_key)
    if prefix is None or not API_KEY_PATTERN.match(raw_key):
        # Should never happen unless generator is modified.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate API key",
        )

    db_key = APIKey(
        user_id=user_id,
        prefix=prefix,
        key_hash=get_password_hash(raw_key),
        name=key_in.name,
    )
    db.add(db_key)
    db.commit()
    db.refresh(db_key)
    log_api_key_creation(user_id, key_in.name)
    return db_key, raw_key


def get_user_api_keys(db: Session, user_id: int) -> list[APIKey]:
    return (
        db.query(APIKey)
        .filter(APIKey.user_id == user_id)
        .order_by(APIKey.id.desc())
        .all()
    )


def revoke_api_key(db: Session, user_id: int, key_id: int) -> APIKey:
    db_key = db.query(APIKey).filter(APIKey.id == key_id, APIKey.user_id == user_id).first()
    if not db_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API Key not found")

    if db_key.status != KeyStatusEnum.REVOKED:
        db_key.status = KeyStatusEnum.REVOKED
        db.commit()
        db.refresh(db_key)
        log_api_key_revoked(user_id, db_key.id, key_name=db_key.name)
    return db_key


def find_api_key_by_raw_key(db: Session, raw_key: str, *, include_revoked: bool = False) -> APIKey | None:
    """
    Resolve an API key from its raw value without scanning the whole table.

    Lookup is performed by an indexed prefix, then verified via hash check.
    When include_revoked=True, revoked keys may be returned (useful to distinguish 401 vs 403).
    """
    if not raw_key or not is_valid_api_key_format(raw_key):
        return None

    prefix = extract_api_key_prefix(raw_key)
    if prefix is None:
        return None

    query = db.query(APIKey).filter(APIKey.prefix == prefix)
    if not include_revoked:
        query = query.filter(APIKey.status == KeyStatusEnum.ACTIVE)

    # Prefix collisions are possible in theory; keep the candidate set bounded.
    candidates = query.order_by(APIKey.id.desc()).limit(50).all()
    matched_inactive: APIKey | None = None

    for db_key in candidates:
        if verify_password(raw_key, db_key.key_hash):
            if db_key.status == KeyStatusEnum.ACTIVE:
                return db_key
            matched_inactive = db_key

    return matched_inactive if include_revoked else None


def update_api_key_usage(db: Session, api_key: APIKey, request: Request) -> None:
    api_key.usage_count = int(api_key.usage_count or 0) + 1
    api_key.last_used = datetime.now(timezone.utc)
    api_key.last_ip = request.client.host if request.client else None
    db.commit()
    db.refresh(api_key)
    log_api_key_used(api_key.user_id, api_key.id, ip_address=api_key.last_ip)


def get_or_create_demo_api_key(db: Session, user: User) -> APIKey:
    demo_raw = settings.TEST_API_KEY
    demo_key = find_api_key_by_raw_key(db, demo_raw, include_revoked=True)
    if demo_key and demo_key.status == KeyStatusEnum.ACTIVE:
        return demo_key

    key_in = APIKeyCreate(name="Frontend Demo Key")
    db_key, _ = create_api_key(db, user.id, key_in)

    prefix = extract_api_key_prefix(demo_raw)
    if prefix is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid demo API key configuration",
        )

    db_key.prefix = prefix
    db_key.key_hash = get_password_hash(demo_raw)
    db.commit()
    db.refresh(db_key)
    return db_key
