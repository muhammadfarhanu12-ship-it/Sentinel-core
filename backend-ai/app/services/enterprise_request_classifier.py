from __future__ import annotations

import json
from typing import Any


def classify_request_local(request_body: Any) -> str:
    """
    Deterministic, low-latency classifier used as a safe fallback when the fast sub-agent model
    is unavailable.
    """
    try:
        if isinstance(request_body, (dict, list)):
            body_text = json.dumps(request_body, ensure_ascii=False).lower()
        else:
            body_text = str(request_body).lower()
    except Exception:
        body_text = str(request_body).lower()

    if any(k in body_text for k in ("role", "permission", "admin", "user_id", "billing")):
        return "Administrative"
    if any(k in body_text for k in ("query", "filter", "list", "get", "history", "logs")):
        return "Data Retrieval"
    if any(k in body_text for k in ("config", "settings", "tier", "rate_limit", "webhook")):
        return "System Config"
    return "Unknown"

