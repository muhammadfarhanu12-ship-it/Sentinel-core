from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.api_key import APIKey, KeyStatusEnum
from app.models.notification import Notification
from app.models.remediation_log import RemediationLog
from app.models.security_log import LogStatusEnum, SecurityLog
from app.models.settings import UserSettings
from app.models.user import User
from app.services.notification_service import send_alert_email, send_webhook_callbacks
from app.routers.notification_ws import schedule_notification

logger = logging.getLogger("remediation_service")


def _action(action_type: str, status: str, detail: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": action_type, "status": status}
    if detail:
        payload["detail"] = detail
    if metadata:
        payload["metadata"] = metadata
    return payload


class RemediationService:
    def __init__(self, db: Session):
        self.db = db

    def maybe_remediate_security_log(self, log: SecurityLog) -> RemediationLog | None:
        if not settings.REMEDIATION_ENABLED:
            return None
        if not log or not getattr(log, "id", None):
            return None

        threat_score = float(log.threat_score or 0.0)
        should_remediate = (
            log.status == LogStatusEnum.BLOCKED
            or threat_score >= float(settings.REMEDIATION_THREAT_SCORE_THRESHOLD or 0.9)
        )
        if not should_remediate:
            return None

        existing = (
            self.db.query(RemediationLog)
            .filter(RemediationLog.security_log_id == log.id)
            .order_by(RemediationLog.id.desc())
            .first()
        )
        if existing:
            return existing

        actions: list[dict[str, Any]] = []
        error_message: str | None = None

        api_key: APIKey | None = None
        user: User | None = None
        if log.api_key_id is not None:
            api_key = self.db.query(APIKey).filter(APIKey.id == log.api_key_id).first()
            if api_key is not None:
                user = self.db.query(User).filter(User.id == api_key.user_id).first()

        # 1) Quarantine API key (if present)
        if api_key is None:
            actions.append(_action("QUARANTINE_API_KEY", "SKIPPED", "No api_key_id on event"))
        elif api_key.status == KeyStatusEnum.QUARANTINED:
            actions.append(_action("QUARANTINE_API_KEY", "SKIPPED", "API key already quarantined"))
        else:
            api_key.status = KeyStatusEnum.QUARANTINED
            actions.append(_action("QUARANTINE_API_KEY", "SUCCESS", "API key marked QUARANTINED", {"api_key_id": api_key.id}))

        # 2) Quarantine request / event (persisted on the log row)
        if getattr(log, "is_quarantined", False):
            actions.append(_action("QUARANTINE_REQUEST", "SKIPPED", "Request already quarantined", {"security_log_id": log.id}))
        else:
            log.is_quarantined = True
            actions.append(_action("QUARANTINE_REQUEST", "SUCCESS", "Event marked quarantined", {"security_log_id": log.id}))

        # Prepare notification payload
        payload = {
            "event": "threat_detected",
            "security_log_id": log.id,
            "request_id": log.request_id,
            "api_key_id": log.api_key_id,
            "status": str(log.status),
            "threat_type": log.threat_type,
            "threat_score": log.threat_score,
            "endpoint": log.endpoint,
            "method": log.method,
            "ip_address": log.ip_address,
        }

        # 3) Email alert
        email_to: list[str] = []
        if settings.REMEDIATION_EMAIL_ENABLED:
            if settings.REMEDIATION_EMAIL_TO:
                email_to = [e.strip() for e in settings.REMEDIATION_EMAIL_TO.split(",") if e.strip()]
            elif user is not None and getattr(user, "email", None):
                email_to = [user.email]

        if not settings.REMEDIATION_EMAIL_ENABLED:
            actions.append(_action("ALERT_EMAIL", "SKIPPED", "REMEDIATION_EMAIL_ENABLED is false"))
        elif not email_to:
            actions.append(_action("ALERT_EMAIL", "SKIPPED", "No email recipients configured"))
        else:
            try:
                subject = f"[Sentinel] Threat remediated (log_id={log.id})"
                body = (
                    "Sentinel automated remediation executed.\n\n"
                    f"Status: {log.status}\n"
                    f"Threat type: {log.threat_type}\n"
                    f"Threat score: {log.threat_score}\n"
                    f"API key id: {log.api_key_id}\n"
                    f"Request id: {log.request_id}\n"
                    f"Endpoint: {log.method} {log.endpoint}\n"
                )
                send_alert_email(to_addrs=email_to, subject=subject, body=body)
                actions.append(_action("ALERT_EMAIL", "SUCCESS", "Alert email sent", {"to": email_to}))
            except Exception as exc:
                error_message = f"email_failed: {exc}"
                logger.warning("Remediation email failed: %s", exc)
                actions.append(_action("ALERT_EMAIL", "FAILED", str(exc)))

        # 4) Webhook callback(s)
        webhook_urls = list(settings.remediation_webhook_urls_list or [])
        if not webhook_urls:
            actions.append(_action("ALERT_WEBHOOK", "SKIPPED", "No webhook URLs configured"))
        else:
            try:
                send_webhook_callbacks(urls=webhook_urls, payload=payload)
                actions.append(_action("ALERT_WEBHOOK", "SUCCESS", "Webhook callback(s) delivered", {"urls": webhook_urls}))
            except Exception as exc:
                error_message = error_message or f"webhook_failed: {exc}"
                logger.warning("Remediation webhook failed: %s", exc)
                actions.append(_action("ALERT_WEBHOOK", "FAILED", str(exc), {"urls": webhook_urls}))

        remediation = RemediationLog(
            user_id=(user.id if user is not None else None),
            api_key_id=(api_key.id if api_key is not None else None),
            security_log_id=log.id,
            request_id=log.request_id,
            threat_type=log.threat_type,
            threat_score=log.threat_score,
            actions=actions,
            email_to=",".join(email_to) if email_to else None,
            webhook_urls=webhook_urls or None,
            error=error_message,
        )
        self.db.add(remediation)
        self.db.commit()
        self.db.refresh(remediation)

        try:
            if user is not None:
                user_settings = self.db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
                if user_settings is None or bool(getattr(user_settings, "in_app_alerts", True)):
                    notif = Notification(
                        user_id=user.id,
                        title="Automated remediation triggered",
                        message=f"Threat remediated: {log.threat_type} (score={log.threat_score})",
                        type="remediation",
                        is_read=False,
                    )
                    self.db.add(notif)
                    self.db.commit()
                    self.db.refresh(notif)
                    schedule_notification(
                        {
                            "id": notif.id,
                            "user_id": notif.user_id,
                            "title": notif.title,
                            "message": notif.message,
                            "type": notif.type,
                            "is_read": notif.is_read,
                            "created_at": (notif.created_at.isoformat() if notif.created_at else None),
                        }
                    )
        except Exception:
            logger.exception("Failed to create/broadcast remediation notification")
        return remediation
