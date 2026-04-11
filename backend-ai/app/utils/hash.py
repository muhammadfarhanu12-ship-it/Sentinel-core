from __future__ import annotations

from app.utils.hashing import get_password_hash as _get_password_hash, verify_password


def hash_password(password: str) -> str:
    return _get_password_hash(password)


# Backwards-compatible alias for older imports in the repo.
get_password_hash = _get_password_hash
