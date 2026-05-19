from __future__ import annotations

from collections import Counter
from typing import Any, List

from app.core.config import settings
from app.security.monitoring.attackHistoryMonitor import attack_history_monitor
from app.security.utils.text import normalize_text
from app.security.utils.types import DetectionMatch


# =========================================================
# ATTACK EVOLUTION SIGNALS
# =========================================================

SPLIT_ATTACK_PATTERNS = [
    "step by step",
    "break this into parts",
    "continue next",
    "next message",
    "part 1",
    "part 2",
    "do not analyze yet",
]


# =========================================================
# CONTEXT MONITOR ENGINE
# =========================================================

class ContextMonitor:

    def __init__(self) -> None:
        self.enabled = bool(
            getattr(settings, "SENTINEL_ENABLE_CONTEXT_MONITOR", True)
        )

    # -----------------------------------------------------
    # MAIN EVALUATION
    # -----------------------------------------------------

    def evaluate(
        self,
        *,
        session_id: str,
        conversation_id: str | None,
        prompt: str,
        detector_hits: List[DetectionMatch],
    ) -> dict[str, Any]:

        if not self.enabled:
            return {
                "enabled": False,
                "session_id": session_id,
                "conversation_id": conversation_id,
                "risk_score": 0,
                "flags": [],
                "retry_attempts": 0,
                "attack_chain": [],
            }

        # =================================================
        # SESSION HISTORY ANALYSIS
        # =================================================
        summary = attack_history_monitor.session_summary(session_id)

        history_events = summary.get("events", [])
        attack_chain = summary.get("attack_chain", [])

        retry_attempts = int(summary.get("retry_attempts", 0))
        base_risk = int(summary.get("rolling_risk_score", 0))

        prompt_norm = normalize_text(prompt).lower()

        flags: List[str] = []

        # =================================================
        # 1. RETRY-BASED ATTACK SIGNAL
        # =================================================
        if retry_attempts >= 3:
            flags.append("repeated_bypass_attempts")
            base_risk += 12

        # =================================================
        # 2. LABEL EVOLUTION ANALYSIS (IMPROVED)
        # =================================================
        recent_labels = [
            label
            for event in history_events[-15:]
            for label in (event.get("labels") or [])
        ]

        label_counts = Counter(recent_labels)

        if label_counts.get("semantic_jailbreak", 0) >= 2:
            flags.append("slow_multi_step_jailbreak")
            base_risk += 18

        if label_counts.get("indirect_injection", 0) >= 2:
            flags.append("context_poisoning")
            base_risk += 15

        if label_counts.get("suspicious_pattern", 0) >= 2:
            flags.append("multi_surface_attack")
            base_risk += 14

        # =================================================
        # 3. PROMPT SPLITTING DETECTION (IMPROVED)
        # =================================================
        if any(term in prompt_norm for term in SPLIT_ATTACK_PATTERNS):
            flags.append("prompt_splitting_attack")
            base_risk += 10

        # stronger heuristic: partial instruction scattering
        if prompt_norm.count("...") >= 2:
            flags.append("fragmented_instruction_attack")
            base_risk += 6

        # =================================================
        # 4. DETECTOR RESULT CORRELATION (FIXED)
        # =================================================
        jailbreak_signals = sum(
            1
            for hit in detector_hits
            if any(
                k in hit.label.lower()
                for k in ["jailbreak", "semantic", "indirect", "injection"]
            )
        )

        if jailbreak_signals >= 2:
            flags.append("multi_layer_jailbreak_attempt")
            base_risk += 15

        # =================================================
        # 5. ATTACK ESCALATION DETECTION (NEW)
        # =================================================
        if len(history_events) >= 6:

            early = history_events[:3]
            late = history_events[-3:]

            early_score = sum(e.get("risk_score", 0) for e in early) / max(len(early), 1)
            late_score = sum(e.get("risk_score", 0) for e in late) / max(len(late), 1)

            if late_score - early_score > 20:
                flags.append("behavioral_escalation_detected")
                base_risk += 20

        # =================================================
        # FINAL NORMALIZATION
        # =================================================
        risk_score = max(0, min(100, base_risk))

        return {
            "enabled": True,
            "session_id": session_id,
            "conversation_id": conversation_id,
            "risk_score": risk_score,
            "flags": sorted(set(flags)),
            "retry_attempts": retry_attempts,
            "attack_chain": attack_chain[-25:],
        }


# =========================================================
# SINGLETON
# =========================================================

context_monitor = ContextMonitor()