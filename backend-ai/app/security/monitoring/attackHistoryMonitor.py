from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List


# =========================================================
# TIME UTIL
# =========================================================

def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =========================================================
# ATTACK INTELLIGENCE ENGINE
# =========================================================

class AttackHistoryMonitor:
    """
    Enterprise-grade attack tracking system.

    Adds:
    - attack chaining detection
    - escalation tracking
    - behavioral analysis
    - session risk evolution
    """

    def __init__(self, *, max_events_per_session: int = 150) -> None:
        self._lock = Lock()

        self._events: Dict[str, deque[Dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=max_events_per_session)
        )

        self._retry_counters: Dict[str, int] = defaultdict(int)

        # NEW: behavioral tracking
        self._attack_velocity: Dict[str, List[int]] = defaultdict(list)

    # =====================================================
    # EVENT RECORDING (IMPROVED)
    # =====================================================

    def record_event(
        self,
        *,
        session_id: str,
        correlation_id: str,
        labels: List[str],
        risk_score: int,
        severity: str,
    ) -> None:

        event = {
            "timestamp": _utcnow_iso(),
            "correlation_id": correlation_id,
            "labels": labels,
            "risk_score": int(risk_score),
            "severity": severity,
        }

        with self._lock:

            self._events[session_id].append(event)

            # -------------------------------------------------
            # IMPROVED RETRY LOGIC (ANTI-SPAM FIX)
            # -------------------------------------------------
            if risk_score >= 70 or severity in ("HIGH", "CRITICAL"):
                self._retry_counters[session_id] += 1

            # -------------------------------------------------
            # VELOCITY TRACKING
            # -------------------------------------------------
            self._attack_velocity[session_id].append(int(risk_score))

    # =====================================================
    # ATTACK ANALYTICS ENGINE (NEW)
    # =====================================================

    def _compute_velocity(self, session_id: str) -> float:
        values = self._attack_velocity.get(session_id, [])[-10:]
        if len(values) < 2:
            return 0.0
        return (values[-1] - values[0]) / len(values)

    # =====================================================
    # SESSION ANALYSIS
    # =====================================================

    def session_summary(self, session_id: str) -> Dict[str, Any]:

        with self._lock:
            events = list(self._events.get(session_id, []))
            retries = int(self._retry_counters.get(session_id, 0))

        if not events:
            return {
                "events": [],
                "rolling_risk_score": 0,
                "retry_attempts": 0,
                "attack_chain": [],
                "attack_velocity": 0.0,
                "escalation_detected": False,
            }

        # -------------------------------------------------
        # Rolling risk score (last 10 events)
        # -------------------------------------------------
        recent = events[-10:]
        rolling_risk_score = int(
            sum(e["risk_score"] for e in recent) / max(len(recent), 1)
        )

        # -------------------------------------------------
        # Attack chain reconstruction
        # -------------------------------------------------
        attack_chain = [
            {
                "id": e["correlation_id"],
                "timestamp": e["timestamp"],
                "labels": e["labels"],
                "risk_score": e["risk_score"],
                "severity": e["severity"],
            }
            for e in events[-25:]
        ]

        # -------------------------------------------------
        # VELOCITY ANALYSIS (NEW)
        # -------------------------------------------------
        velocity = self._compute_velocity(session_id)

        # -------------------------------------------------
        # ESCALATION DETECTION (NEW)
        # -------------------------------------------------
        escalation_detected = False

        if len(recent) >= 5:

            early = sum(e["risk_score"] for e in recent[:3]) / 3
            late = sum(e["risk_score"] for e in recent[-3:]) / 3

            if late - early > 25:
                escalation_detected = True

        return {
            "events": events[-60:],
            "rolling_risk_score": rolling_risk_score,
            "retry_attempts": retries,
            "attack_chain": attack_chain,
            "attack_velocity": round(velocity, 4),
            "escalation_detected": escalation_detected,
        }


# =========================================================
# SINGLETON
# =========================================================

attack_history_monitor = AttackHistoryMonitor()