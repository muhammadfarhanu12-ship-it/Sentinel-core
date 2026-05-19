from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional
import uuid


class SecurityAuditTrail:
    """
    Security-grade audit trail:
    - structured logging
    - correlation tracking
    - session-aware telemetry
    - attack forensics ready
    """

    def __init__(self, *, max_events: int = 5000) -> None:
        self._lock = Lock()
        self._events: deque[Dict[str, Any]] = deque(maxlen=max_events)

    def _generate_id(self) -> str:
        return str(uuid.uuid4())

    def append(
        self,
        *,
        event_type: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
        severity: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Add a structured security event.
        """

        event = {
            "event_id": self._generate_id(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "session_id": session_id,
            "user_id": user_id,
            "correlation_id": correlation_id or self._generate_id(),
            "severity": severity,
            "data": data or {},
        }

        with self._lock:
            self._events.append(event)

        return event

    def latest(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            rows = list(self._events)

        if limit <= 0:
            return rows
        return rows[-limit:]

    def search_by_session(self, session_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [e for e in self._events if e.get("session_id") == session_id]

    def search_by_correlation(self, correlation_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [e for e in self._events if e.get("correlation_id") == correlation_id]

    def risk_summary(self, session_id: str) -> Dict[str, Any]:
        with self._lock:
            events = [e for e in self._events if e.get("session_id") == session_id]

        severity_map = {"LOW": 1, "INFO": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

        score = sum(severity_map.get(e.get("severity", "INFO"), 1) for e in events)

        return {
            "session_id": session_id,
            "total_events": len(events),
            "risk_score": score,
            "has_attack_signals": any(
                "injection" in str(e.get("event_type", "")).lower() or
                "jailbreak" in str(e.get("event_type", "")).lower()
                for e in events
            ),
        }


# Global instance
security_audit_trail = SecurityAuditTrail()