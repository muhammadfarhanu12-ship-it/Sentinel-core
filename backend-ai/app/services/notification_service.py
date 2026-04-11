from __future__ import annotations

import json
import logging
import urllib.request
from html import escape
from typing import Any

from app.core.config import settings
from app.services.email_service import send_email

logger = logging.getLogger("notification_service")


def send_alert_email(*, to_addrs: list[str], subject: str, body: str) -> None:
    if not to_addrs:
        raise ValueError("to_addrs is required")
    result = send_email(to=to_addrs, subject=subject, html=f"<pre>{escape(body)}</pre>", text=body)
    if not result.success:
        raise RuntimeError(result.error or "Failed to send alert email")


def send_webhook_callbacks(*, urls: list[str], payload: dict[str, Any]) -> None:
    if not urls:
        return

    data = json.dumps(payload).encode("utf-8")
    timeout = float(settings.REMEDIATION_WEBHOOK_TIMEOUT_SECONDS or 3.0)

    last_error: Exception | None = None
    for url in urls:
        try:
            req = urllib.request.Request(
                url,
                data=data,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "sentinelcore-remediation/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (explicitly configured)
                # Consume the body to ensure the request completes across implementations.
                resp.read()
        except Exception as exc:
            last_error = exc
            logger.warning("Webhook callback failed for %s: %s", url, exc)

    if last_error is not None:
        raise last_error
