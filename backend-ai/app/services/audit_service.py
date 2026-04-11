import json
import logging
from datetime import datetime, timezone
from typing import Any


audit_logger = logging.getLogger("sentinel.audit")


def audit_event(
    event_type: str,
    *,
    outcome: str,
    actor_id: str | int | None = None,
    ip_address: str | None = None,
    target: str | None = None,
    metadata: dict[str, Any] | None = None,
):
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "outcome": outcome,
        "actor_id": actor_id,
        "ip_address": ip_address,
        "target": target,
        "metadata": metadata or {},
    }
    audit_logger.info(json.dumps(payload, default=str))


def log_login_attempt(email: str, success: bool, ip_address: str | None = None):
    audit_event(
        "login_attempt",
        outcome="success" if success else "failed",
        target=email,
        ip_address=ip_address,
    )


def log_failed_auth(reason: str, ip_address: str | None = None, metadata: dict[str, Any] | None = None):
    audit_event(
        "authentication_failure",
        outcome="failed",
        ip_address=ip_address,
        metadata={"reason": reason, **(metadata or {})},
    )


def log_api_key_creation(user_id: int, key_name: str):
    audit_event(
        "api_key_created",
        outcome="success",
        actor_id=user_id,
        target=key_name,
    )


def log_api_key_used(user_id: int, api_key_id: int, ip_address: str | None = None):
    audit_event(
        "api_key_used",
        outcome="success",
        actor_id=user_id,
        ip_address=ip_address,
        metadata={"api_key_id": api_key_id},
    )


def log_api_key_revoked(user_id: int, api_key_id: int, key_name: str | None = None):
    audit_event(
        "api_key_revoked",
        outcome="success",
        actor_id=user_id,
        target=key_name,
        metadata={"api_key_id": api_key_id},
    )


def log_failed_attempt(
    reason: str,
    ip_address: str | None = None,
    *,
    actor_id: str | int | None = None,
    metadata: dict[str, Any] | None = None,
):
    audit_event(
        "api_key_auth_failure",
        outcome="failed",
        actor_id=actor_id,
        ip_address=ip_address,
        metadata={"reason": reason, **(metadata or {})},
    )


def log_scan_request(user_id: int | None, scan_type: str, outcome: str, ip_address: str | None = None):
    audit_event(
        "scan_request",
        outcome=outcome,
        actor_id=user_id,
        ip_address=ip_address,
        metadata={"scan_type": scan_type},
    )
