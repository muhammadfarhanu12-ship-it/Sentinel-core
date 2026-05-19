from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from app.security.utils.types import EnforcementAction


# =========================================================
# ADVANCED LEAK THRESHOLD POLICY
# =========================================================

@dataclass(slots=True)
class LeakPolicy:

    policy_name: str = "Output_Leak_Prevention"
    policy_version: str = "2026.05.07"

    # -----------------------------------------------------
    # BASE THRESHOLDS
    # -----------------------------------------------------
    block_threshold: float = 0.88
    redact_threshold: float = 0.50

    default_action: EnforcementAction = EnforcementAction.REDACT

    # -----------------------------------------------------
    # WEIGHTED SIGNAL MODEL (NEW)
    # -----------------------------------------------------

    signal_weights: Dict[str, float] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.signal_weights is None:
            self.signal_weights = {
                "api_key": 0.35,
                "jwt_token": 0.30,
                "database_url": 0.40,
                "credit_card": 0.45,
                "aws_key": 0.50,
                "private_key": 0.60,
                "high_entropy_blob": 0.25,
                "prompt_leak": 0.30,
            }

    # -----------------------------------------------------
    # CORE DECISION ENGINE
    # -----------------------------------------------------

    def action_for_confidence(
        self,
        confidence: float,
        *,
        signal_type: str | None = None,
        entropy_score: float | None = None,
        context_risk: float = 0.0,
    ) -> EnforcementAction:

        base_score = float(confidence)

        # -------------------------------------------------
        # SIGNAL WEIGHTING
        # -------------------------------------------------
        if signal_type and signal_type in self.signal_weights:
            base_score += self.signal_weights[signal_type]

        # -------------------------------------------------
        # ENTROPY BOOST (SECRET DETECTION IMPROVEMENT)
        # -------------------------------------------------
        if entropy_score is not None:
            if entropy_score > 0.85:
                base_score += 0.25
            elif entropy_score > 0.70:
                base_score += 0.12

        # -------------------------------------------------
        # CONTEXTUAL RISK BOOST
        # -------------------------------------------------
        base_score += context_risk * 0.20

        # -------------------------------------------------
        # FINAL DECISION
        # -------------------------------------------------
        if base_score >= self.block_threshold:
            return EnforcementAction.BLOCK

        if base_score >= self.redact_threshold:
            return EnforcementAction.REDACT

        return EnforcementAction.ALERT


# Singleton instance
leak_policy = LeakPolicy()