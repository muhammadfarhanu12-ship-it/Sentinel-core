from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.models.api_key import APIKey
from app.models.notification import Notification
from app.models.security_log import LogStatusEnum, SecurityLog
from app.routers.log_ws import schedule_broadcast
from app.routers.notification_ws import schedule_notification
from app.schemas.logs_schema import LogResponse
from app.services.remediation_service import RemediationService
from app.models.settings import UserSettings
from app.services.threat_detection import primary_threat_type
from app.core.config import settings

logger = logging.getLogger("log_service")

MAX_LOG_FETCH_LIMIT = 1000


class LogService:
    """
    LogService manages SecurityLog CRUD and real-time broadcasting.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_user_logs(
        self,
        user_id: int,
        *,
        limit: int = 100,
        offset: int = 0,
        status_filter: LogStatusEnum | None = None,
        threat_type: str | None = None,
        api_key_id: int | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        query: str | None = None,
    ) -> list[SecurityLog]:
        limit = max(1, min(int(limit), MAX_LOG_FETCH_LIMIT))
        offset = max(0, int(offset))

        q = (
            self.db.query(SecurityLog)
            .join(APIKey, SecurityLog.api_key_id == APIKey.id)
            .filter(APIKey.user_id == user_id)
        )

        if api_key_id is not None:
            q = q.filter(SecurityLog.api_key_id == api_key_id)
        if status_filter is not None:
            q = q.filter(SecurityLog.status == status_filter)
        if threat_type:
            q = q.filter(SecurityLog.threat_type == threat_type)
        if start_time is not None:
            q = q.filter(SecurityLog.timestamp >= start_time)
        if end_time is not None:
            q = q.filter(SecurityLog.timestamp <= end_time)
        if query:
            term = f"%{query.strip()}%"
            q = q.filter(
                or_(
                    SecurityLog.endpoint.ilike(term),
                    SecurityLog.method.ilike(term),
                    SecurityLog.threat_type.ilike(term),
                )
            )

        return (
            q.order_by(desc(SecurityLog.timestamp), desc(SecurityLog.id))
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_log_by_id(self, user_id: int, log_id: int) -> SecurityLog:
        log = (
            self.db.query(SecurityLog)
            .join(APIKey, SecurityLog.api_key_id == APIKey.id)
            .filter(APIKey.user_id == user_id, SecurityLog.id == log_id)
            .first()
        )
        if not log:
            logger.warning("Log %s not found for user %s", log_id, user_id)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
        return log

    def create_log(
        self,
        *,
        api_key_id: int | None,
        status_value: LogStatusEnum | str,
        threat_type: Optional[str] = None,
        threat_types: Optional[list[str]] = None,
        threat_score: Optional[float] = None,
        attack_vector: Optional[str] = None,
        risk_level: Optional[str] = None,
        detection_stage_triggered: Optional[list[str]] = None,
        tokens_used: int = 0,
        latency_ms: int = 0,
        raw_payload: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        method: Optional[str] = None,
        ip_address: Optional[str] = None,
        model: Optional[str] = None,
        risk_score: Optional[float] = None,
    ) -> SecurityLog:
        status_enum = status_value if isinstance(status_value, LogStatusEnum) else LogStatusEnum(str(status_value))

        # Backwards compatibility: if caller only provides multi-label types, derive the primary legacy label.
        if not threat_type and threat_types:
            threat_type = primary_threat_type(threat_types)

        log = SecurityLog(
            api_key_id=api_key_id,
            status=status_enum,
            threat_type=threat_type,
            threat_types=threat_types,
            threat_score=threat_score,
            attack_vector=attack_vector,
            risk_level=risk_level,
            detection_stage_triggered=detection_stage_triggered,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            raw_payload=raw_payload,
            request_id=request_id,
            endpoint=endpoint,
            method=method,
            ip_address=ip_address,
            model=model,
            risk_score=risk_score,
        )

        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)

        api_key = None
        owner_user_id: str | None = None
        if log.api_key_id is not None:
            api_key = self.db.query(APIKey).filter(APIKey.id == log.api_key_id).first()
            if api_key is not None:
                owner_user_id = str(api_key.user_id)

        try:
            payload = LogResponse.model_validate(log, from_attributes=True).model_dump(mode="json")
            schedule_broadcast(payload, user_id=owner_user_id)
        except Exception:
            logger.exception("Failed to broadcast log %s", getattr(log, "id", None))

        try:
            # Create in-app notifications for high-signal events (blocked/redacted), user-scoped by API key owner.
            if log.status in {LogStatusEnum.BLOCKED, LogStatusEnum.REDACTED} and log.api_key_id is not None:
                if api_key is not None:
                    user_settings = self.db.query(UserSettings).filter(UserSettings.user_id == api_key.user_id).first()
                    if user_settings is None or bool(getattr(user_settings, "in_app_alerts", True)):
                        title = "Threat blocked" if log.status == LogStatusEnum.BLOCKED else "Content redacted"
                        label = ", ".join(log.threat_types) if getattr(log, "threat_types", None) else log.threat_type
                        notif = Notification(
                            user_id=api_key.user_id,
                            title=title,
                            message=f"{label} detected for {log.method or ''} {log.endpoint or ''}".strip(),
                            type="threat_detected",
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
            logger.exception("Failed to create/broadcast in-app notification for log %s", getattr(log, "id", None))

        # Real-time security response: push a high-risk alert based on threat_score, even if status isn't blocked.
        try:
            if log.api_key_id is not None and float(log.threat_score or 0.0) >= float(getattr(settings, "DEFENSE_WS_ALERT_THRESHOLD", 0.8)):
                if api_key is not None:
                    user_settings = self.db.query(UserSettings).filter(UserSettings.user_id == api_key.user_id).first()
                    if user_settings is None or bool(getattr(user_settings, "in_app_alerts", True)):
                        label = ", ".join(log.threat_types) if getattr(log, "threat_types", None) else log.threat_type
                        notif = Notification(
                            user_id=api_key.user_id,
                            title="High-risk threat detected",
                            message=(f"{label} (score={float(log.threat_score or 0.0):.2f}) - {log.attack_vector or 'Suspicious activity detected.'}"),
                            type="security_alert",
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
            logger.exception("Failed to create/broadcast high-risk security alert for log %s", getattr(log, "id", None))

        # Behavioral detection: repeated attacks (3+) -> auto-flag API key + temporary rate limit.
        try:
            if log.api_key_id is not None and float(log.threat_score or 0.0) >= float(getattr(settings, "DEFENSE_REPEAT_ATTACK_THRESHOLD", 0.8)):
                window_seconds = int(getattr(settings, "DEFENSE_REPEAT_ATTACK_WINDOW_SECONDS", 600))
                repeat_count = int(getattr(settings, "DEFENSE_REPEAT_ATTACK_COUNT", 3))
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
                recent = (
                    self.db.query(SecurityLog)
                    .filter(
                        SecurityLog.api_key_id == log.api_key_id,
                        SecurityLog.timestamp >= cutoff,
                        SecurityLog.threat_score >= float(getattr(settings, "DEFENSE_REPEAT_ATTACK_THRESHOLD", 0.8)),
                    )
                    .count()
                )
                if recent >= repeat_count:
                    api_key = self.db.query(APIKey).filter(APIKey.id == log.api_key_id).first()
                    if api_key is not None:
                        now = datetime.now(timezone.utc)
                        api_key.flagged_at = now
                        block_seconds = int(getattr(settings, "DEFENSE_TEMP_BLOCK_SECONDS", 600))
                        until = now + timedelta(seconds=block_seconds)
                        current_until = getattr(api_key, "temp_block_until", None)
                        if current_until is None or (current_until.tzinfo is None and current_until.replace(tzinfo=timezone.utc) < until) or (current_until.tzinfo is not None and current_until < until):
                            api_key.temp_block_until = until
                        self.db.commit()

                        # Notify user about the automatic action.
                        user_settings = self.db.query(UserSettings).filter(UserSettings.user_id == api_key.user_id).first()
                        if user_settings is None or bool(getattr(user_settings, "in_app_alerts", True)):
                            notif = Notification(
                                user_id=api_key.user_id,
                                title="API key auto-flagged",
                                message=f"Detected {recent} high-risk requests in {window_seconds}s. Temporary rate limit applied for {block_seconds}s.",
                                type="abuse_detected",
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
            logger.exception("Failed to auto-flag / temp-block api key for log %s", getattr(log, "id", None))

        try:
            RemediationService(self.db).maybe_remediate_security_log(log)
        except Exception:
            logger.exception("Automated remediation failed for log %s", getattr(log, "id", None))

        return log
