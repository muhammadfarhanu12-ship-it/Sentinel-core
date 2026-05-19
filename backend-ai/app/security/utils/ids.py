from __future__ import annotations

import secrets
from datetime import datetime, timezone


def correlation_id(prefix: str = "sec") -> str:
    now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{prefix}_{now}_{secrets.token_hex(6)}"
