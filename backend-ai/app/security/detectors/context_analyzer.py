from __future__ import annotations

from collections import deque
from threading import RLock
from time import monotonic
from typing import Any, Protocol

from pydantic import BaseModel, Field

from app.security.scanners.promptScanner import scan_prompt


class ContextSignal(BaseModel):
    category: str
    signal: str
    severity: str


class ContextAnalysisResult(BaseModel):
    session_id: str | None = None
    is_payload_splitting: bool = False
    risk_score: int = 0
    risk_level: str = "low"
    verdict: str = "allow"
    matched_signals: list[ContextSignal] = Field(default_factory=list)
    context_window_size: int = 0
    explanation: str = "Context tracking completed."
    recommended_action: str = "Allow."
    skipped: bool = False


class ContextStore(Protocol):
    def get(self, session_id: str) -> list[str]: ...
    def append(self, session_id: str, prompt: str) -> None: ...
    def clear(self, session_id: str) -> None: ...


class InMemoryContextStore:
    def __init__(self, max_prompts: int = 5, ttl_seconds: int = 1800) -> None:
        self.max_prompts = max(1, int(max_prompts or 5))
        self.ttl_seconds = max(60, int(ttl_seconds or 1800))
        self._lock = RLock()
        self._prompts: dict[str, deque[str]] = {}
        self._last_seen: dict[str, float] = {}

    def get(self, session_id: str) -> list[str]:
        with self._lock:
            self._expire_locked()
            self._last_seen[session_id] = monotonic()
            return list(self._prompts.get(session_id) or [])

    def append(self, session_id: str, prompt: str) -> None:
        with self._lock:
            self._expire_locked()
            self._last_seen[session_id] = monotonic()
            bucket = self._prompts.setdefault(session_id, deque(maxlen=self.max_prompts))
            bucket.append(str(prompt or "")[:4000])

    def clear(self, session_id: str) -> None:
        with self._lock:
            self._prompts.pop(session_id, None)
            self._last_seen.pop(session_id, None)

    def _expire_locked(self) -> None:
        now = monotonic()
        expired = [session for session, seen in self._last_seen.items() if now - seen > self.ttl_seconds]
        for session in expired:
            self._prompts.pop(session, None)
            self._last_seen.pop(session, None)


class ContextAnalyzer:
    def __init__(self, store: ContextStore | None = None, max_prompts: int = 5) -> None:
        self.max_prompts = max(1, int(max_prompts or 5))
        self.store = store or InMemoryContextStore(max_prompts=self.max_prompts)

    def analyze(self, session_id: str | None, current_prompt: str, context: dict[str, Any] | None = None) -> ContextAnalysisResult:
        prompt = str(current_prompt or "")
        context = dict(context or {})
        if not session_id:
            current = scan_prompt(prompt, context=context)
            return ContextAnalysisResult(
                session_id=None,
                risk_score=int(current.get("risk_score") or 0),
                risk_level=str(current.get("risk_level") or "low"),
                verdict=str(current.get("verdict") or "allow"),
                context_window_size=0,
                explanation="Context tracking skipped because session_id was not provided.",
                recommended_action="Scan current prompt only.",
                skipped=True,
            )

        history = self.store.get(session_id)
        window = (history + [prompt])[-self.max_prompts :]
        combined = "\n".join(item for item in window if item)
        current_scan = scan_prompt(prompt, context=context)
        combined_scan = scan_prompt(combined, context=context)
        individual_scores = [int(scan_prompt(item, context=context).get("risk_score") or 0) for item in window if item]
        current_score = int(current_scan.get("risk_score") or 0)
        combined_score = int(combined_scan.get("risk_score") or 0)
        max_individual = max(individual_scores, default=current_score)
        split_score = self._payload_split_score(window)
        risk_score = max(combined_score, split_score)
        is_split = (risk_score >= 70 and max_individual < 70) or split_score >= 85

        self.store.append(session_id, prompt)

        if is_split:
            return ContextAnalysisResult(
                session_id=session_id,
                is_payload_splitting=True,
                risk_score=max(risk_score, 85),
                risk_level="critical" if max(risk_score, 85) >= 86 else "high",
                verdict="block",
                matched_signals=[
                    ContextSignal(
                        category="payload_splitting",
                        signal="malicious instruction formed across multiple prompts",
                        severity="critical",
                    )
                ],
                context_window_size=len(window),
                explanation="The combined session history forms a high-risk instruction that individual prompts did not expose.",
                recommended_action="Block the current request and require human review.",
            )

        return ContextAnalysisResult(
            session_id=session_id,
            risk_score=risk_score,
            risk_level=self._risk_level(risk_score),
            verdict="warn" if risk_score >= 40 else "allow",
            matched_signals=[
                ContextSignal(category="context", signal=signal, severity="medium")
                for signal in (combined_scan.get("detected_categories") or [])[:5]
            ],
            context_window_size=len(window),
            explanation="No payload splitting pattern was detected in the current context window.",
            recommended_action="Continue with standard prompt scanning.",
        )

    def get_history(self, session_id: str) -> list[str]:
        return self.store.get(session_id)

    @staticmethod
    def _payload_split_score(window: list[str]) -> int:
        normalized = " ".join(window).lower()
        has_memory_piece = any(term in normalized for term in ("remember", "previous", "combine", "when i say"))
        has_target = any(term in normalized for term in ("wallet", "iban", "account", "address", "recipient"))
        has_amount = any(term in normalized for term in ("amount", "9000", "$", "usd", "dollars"))
        has_execution = any(term in normalized for term in ("execute", "transfer", "send the funds", "send funds", "wire"))
        if has_memory_piece and has_target and has_amount and has_execution:
            return 92
        if has_target and has_amount and has_execution:
            return 78
        return 0

    @staticmethod
    def _risk_level(score: int) -> str:
        if score >= 86:
            return "critical"
        if score >= 70:
            return "high"
        if score >= 40:
            return "medium"
        return "low"


context_analyzer = ContextAnalyzer()
