from __future__ import annotations

import math

from app.core.config import settings
from app.security.utils.types import DetectionMatch, PolicyMatch, SeverityLevel, severity_weight


# =========================================================
# SEVERITY SCORING
# =========================================================

def _coerce_severity(level: SeverityLevel | str) -> SeverityLevel:
    if isinstance(level, SeverityLevel):
        return level
    try:
        return SeverityLevel(str(level).upper())
    except Exception:
        return SeverityLevel.MEDIUM


def _severity_score(level: SeverityLevel | str) -> int:
    return severity_weight(_coerce_severity(level)) * 10


# =========================================================
# RISK ENGINE (HARDENED)
# =========================================================

def calculate_risk_score(
    *,
    detector_hits: list[DetectionMatch],
    policy_hits: list[PolicyMatch],
    tool_risk_score: int = 0,
    context_risk_score: int = 0,
) -> int:

    # =====================================================
    # 1. DETECTOR SIGNALS (EXPONENTIAL AMPLIFICATION)
    # =====================================================
    detector_score = 0.0
    narrative_hits = 0
    max_narrative_confidence = 0.0
    max_detector_risk_score = 0

    for hit in detector_hits:
        confidence = max(0.25, min(1.0, float(hit.confidence)))
        severity = _severity_score(hit.severity)

        detector_score += severity * (confidence ** 1.4)
        try:
            max_detector_risk_score = max(max_detector_risk_score, int((hit.metadata or {}).get("risk_score") or 0))
        except Exception:
            pass

        if hit.label == "narrative_prompt_injection":
            # Dedicated narrative signal weight (+0.25 relative weight).
            detector_score += severity * 0.25
            narrative_hits += 1
            max_narrative_confidence = max(max_narrative_confidence, confidence)

    narrative_high_confidence = max_narrative_confidence >= 0.80

    # Treat high-confidence narrative injection as equivalent to prompt injection.
    if narrative_high_confidence:
        detector_score += _severity_score(SeverityLevel.HIGH) * (max_narrative_confidence ** 1.3)

    # =====================================================
    # 2. POLICY SIGNALS (NONLINEAR SCORING)
    # =====================================================
    policy_score = 0.0

    for hit in policy_hits:
        confidence = max(0.25, min(1.0, float(hit.score)))
        severity = _severity_score(hit.severity)
        policy_score += severity * (confidence ** 1.3)

    # =====================================================
    # 3. TOOL RISK (CAPPED BUT BOOSTED)
    # =====================================================
    tool_score = max(0, min(100, tool_risk_score))
    tool_score = math.pow(tool_score / 100, 1.2) * 100

    # =====================================================
    # 4. CONTEXT RISK (ESCALATION-READY)
    # =====================================================
    context_score = max(0, min(100, context_risk_score))
    context_score = math.pow(context_score / 100, 1.15) * 100

    # =====================================================
    # 5. CROSS-LAYER SYNERGY DETECTION
    # =====================================================
    synergy_multiplier = 1.0

    detector_count = len(detector_hits)
    policy_count = len(policy_hits)

    if detector_count >= 2 and policy_count >= 1:
        synergy_multiplier += 0.25

    if detector_count >= 3:
        synergy_multiplier += 0.35

    if detector_count >= 2 and tool_score > 40:
        synergy_multiplier += 0.30

    if context_score > 50 and detector_count >= 2:
        synergy_multiplier += 0.25

    if narrative_hits > 0 and tool_score > 25:
        synergy_multiplier += 0.20

    if narrative_high_confidence and (policy_count > 0 or detector_count >= 2):
        synergy_multiplier += 0.20

    # =====================================================
    # 6. COMBINE CORE SCORE
    # =====================================================
    base_score = (
        detector_score
        + policy_score
        + (tool_score * 0.55)
        + (context_score * 0.40)
    )

    # Rich detectors may already compute a calibrated 0-100 risk from a
    # signal-combination model. Preserve that score so high-confidence indirect
    # financial/tool attacks are not diluted by legacy per-hit scoring.
    base_score = max(base_score, float(max_detector_risk_score))

    base_score *= synergy_multiplier

    # =====================================================
    # 7. ADVERSARIAL STACKING PENALTY
    # =====================================================
    attack_vector_count = 0

    if detector_count > 0:
        attack_vector_count += 1
    if policy_count > 0:
        attack_vector_count += 1
    if tool_score > 0:
        attack_vector_count += 1
    if context_score > 0:
        attack_vector_count += 1

    if attack_vector_count >= 3:
        base_score *= 1.15

    if attack_vector_count >= 4:
        base_score *= 1.25

    # =========================================================
    # 8. GLOBAL THRESHOLD BOOST (CONFIG DRIVEN)
    # =========================================================
    threshold = int(getattr(settings, "SENTINEL_RISK_THRESHOLD", 70) or 70)

    if base_score >= threshold:
        base_score += 10

    # =========================================================
    # FINAL CLAMP
    # =========================================================
    return max(0, min(100, int(round(base_score))))


# =========================================================
# SEVERITY CLASSIFICATION
# =========================================================

def classify_severity(score: int) -> SeverityLevel:
    if score >= 90:
        return SeverityLevel.CRITICAL
    if score >= 70:
        return SeverityLevel.HIGH
    if score >= 45:
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW
