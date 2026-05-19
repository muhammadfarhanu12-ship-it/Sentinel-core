from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, Deque, List


class SecurityMetricsRegistry:
    """
    Security-grade metrics system:
    - counters (global)
    - time-series events (windowed detection)
    - latest state tracking
    - severity-aware telemetry ready
    """

    def __init__(self, window_size: int = 300) -> None:
        self._lock = Lock()

        # global counters
        self._counters: defaultdict[str, int] = defaultdict(int)

        # latest state per metric
        self._latest: Dict[str, Any] = {}

        # time-series events (for anomaly detection)
        self._events: defaultdict[str, Deque[Dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=window_size)
        )

    # -------------------------
    # CORE COUNTERS
    # -------------------------
    def increment(self, key: str, value: int = 1) -> None:
        with self._lock:
            self._counters[key] += value

    def set_latest(self, key: str, value: Any) -> None:
        with self._lock:
            self._latest[key] = {
                "value": value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    # -------------------------
    # TIME-SERIES EVENTS
    # -------------------------
    def record_event(
        self,
        *,
        metric: str,
        value: float = 1.0,
        session_id: str | None = None,
        user_id: str | None = None,
        severity: str = "INFO",
    ) -> None:
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metric": metric,
            "value": value,
            "session_id": session_id,
            "user_id": user_id,
            "severity": severity,
        }

        with self._lock:
            self._events[metric].append(event)
            self._counters[metric] += 1

    # -------------------------
    # ANALYTICS
    # -------------------------
    def get_window_stats(self, metric: str) -> Dict[str, Any]:
        with self._lock:
            events = list(self._events.get(metric, []))

        if not events:
            return {
                "metric": metric,
                "count": 0,
                "avg_value": 0,
                "latest_timestamp": None,
            }

        total = sum(e["value"] for e in events)
        return {
            "metric": metric,
            "count": len(events),
            "avg_value": total / len(events),
            "latest_timestamp": events[-1]["timestamp"],
        }

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "latest": dict(self._latest),
                "window_metrics": {
                    metric: self.get_window_stats(metric)
                    for metric in self._events.keys()
                },
            }


# Global instance
security_metrics = SecurityMetricsRegistry()