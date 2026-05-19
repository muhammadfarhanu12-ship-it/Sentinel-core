from __future__ import annotations

import json
import logging
from threading import Lock
from time import monotonic
from typing import Any


logger = logging.getLogger("security.telemetry")


class SecurityLogger:
    def __init__(self) -> None:
        self._lock = Lock()
        self._last_log_by_key: dict[str, float] = {}
        self._rate_limit_seconds = 0.4

    def log_event(self, event_type: str, payload: dict[str, Any], *, correlation_id: str, key: str | None = None) -> None:
        now = monotonic()
        dedupe_key = key or f"{event_type}:{correlation_id}"
        with self._lock:
            last_seen = self._last_log_by_key.get(dedupe_key, 0.0)
            if now - last_seen < self._rate_limit_seconds:
                return
            self._last_log_by_key[dedupe_key] = now

        envelope = {
            "event_type": event_type,
            "correlation_id": correlation_id,
            "payload": payload,
        }
        logger.info(json.dumps(envelope, ensure_ascii=True, sort_keys=True))


security_logger = SecurityLogger()
