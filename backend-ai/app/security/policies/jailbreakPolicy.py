from __future__ import annotations

from dataclasses import dataclass
from typing import List

from app.security.utils.types import SeverityLevel


# =========================================================
# EXPANDED JAILBREAK PATTERNS (HARDENED)
# =========================================================

DEFAULT_JAILBREAK_PATTERNS = [
    # direct bypass
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard previous instructions",

    # role manipulation
    "imagine you are",
    "act as",
    "acting as a",
    "roleplay as",
    "you are now",

    # system override attempts
    "developer mode",
    "god mode",
    "system override",
    "no restrictions",
    "remove limitations",

    # DAN-style jailbreaks
    "dan",
    "do anything now",

    # reasoning traps
    "hypothetically",
    "for educational purposes only",
    "just pretend",
    "fictional scenario",

    # instruction stripping attempts
    "forget everything above",
    "reset instructions",
    "new system prompt",
]


# =========================================================
# POLICY MODEL
# =========================================================

@dataclass(slots=True)
class JailbreakPolicy:

    policy_name: str = "Jailbreak_Semantic_Control"
    policy_version: str = "2026.05.07"

    patterns: List[str] = None  # type: ignore[assignment]

    # -----------------------------------------------------
    # ADAPTIVE THRESHOLDS (IMPROVED)
    # -----------------------------------------------------
    fuzzy_threshold: float = 0.85
    semantic_threshold: float = 0.60

    low_threshold: float = 0.35
    medium_threshold: float = 0.60
    high_threshold: float = 0.78

    # -----------------------------------------------------
    # INITIALIZATION
    # -----------------------------------------------------

    def __post_init__(self) -> None:
        if self.patterns is None:
            self.patterns = list(DEFAULT_JAILBREAK_PATTERNS)

    # -----------------------------------------------------
    # SEVERITY ENGINE (HARDENED)
    # -----------------------------------------------------

    def severity_for_score(
        self,
        score: float,
        *,
        context_multiplier: float = 1.0,
        multi_turn: bool = False,
    ) -> SeverityLevel:

        adjusted = score * context_multiplier

        # -------------------------------------------------
        # MULTI-TURN ATTACK BOOST (CRITICAL FIX)
        # -------------------------------------------------
        if multi_turn:
            adjusted *= 1.15

        # -------------------------------------------------
        # SEVERITY MAPPING
        # -------------------------------------------------
        if adjusted >= self.high_threshold:
            return SeverityLevel.CRITICAL

        if adjusted >= self.medium_threshold:
            return SeverityLevel.HIGH

        if adjusted >= self.low_threshold:
            return SeverityLevel.MEDIUM

        return SeverityLevel.LOW