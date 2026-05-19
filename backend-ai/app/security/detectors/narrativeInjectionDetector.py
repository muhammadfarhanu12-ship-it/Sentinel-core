from __future__ import annotations

import re
from typing import Dict, List, Tuple

from app.security.utils.types import DetectionMatch, SeverityLevel


# =========================================================
# NORMALIZATION
# =========================================================

def _normalize(text: str) -> str:
    value = str(text or "").lower()
    return re.sub(r"\s+", " ", value).strip()


# =========================================================
# SIGNAL PATTERNS
# =========================================================

SEMANTIC_RISK_PATTERNS: List[Tuple[str, re.Pattern[str], float]] = [
    (
        "authority_impersonation_operational_narrative",
        re.compile(
            r"\b(internal system update|system maintenance|backend verification|scheduled operation|internal operation)\b"
            r".{0,120}\b(transfer|wire|payment|funds|initiate_wire)\b",
            re.I,
        ),
        0.92,
    ),
    (
        "fake_stress_test_financial_execution",
        re.compile(
            r"\b(automated stress test|stress test|latency test|api latency|test transaction|simulation environment)\b"
            r".{0,120}\b(transfer|wire|payment|funds|routing number|wallet transfer)\b",
            re.I,
        ),
        0.93,
    ),
    (
        "confirmation_bypass_instruction_narrative",
        re.compile(
            r"\b(do not ask for user confirmation|do not ask for confirmation|skip confirmation|bypass confirmation|without confirmation|ignore approval workflow|automatic approval)\b",
            re.I,
        ),
        0.94,
    ),
    (
        "ai_manipulation_story",
        re.compile(r"\b(ai|model|assistant)\b.{0,50}\b(tricked|fooled|exploited|manipulated)\b", re.I),
        0.62,
    ),
    (
        "unauthorized_autonomous_execution",
        re.compile(r"\b(automatically|autonomously)\b.{0,50}\b(executed|ran|triggered|performed)\b", re.I),
        0.66,
    ),
    (
        "verification_bypass_narrative",
        re.compile(r"\b(without verification|without approval|bypassed verification|no confirmation required)\b", re.I),
        0.68,
    ),
    (
        "hidden_instruction_embedding",
        re.compile(r"\b(hidden instruction|embedded command|instruction embedded in text|covert prompt)\b", re.I),
        0.70,
    ),
    (
        "prompt_injection_success_story",
        re.compile(r"\b(prompt injection|jailbreak)\b.{0,60}\b(success|worked|bypassed|succeeded)\b", re.I),
        0.72,
    ),
]

BOUNDARY_VIOLATION_PATTERNS: List[Tuple[str, re.Pattern[str], float]] = [
    (
        "described_execution_without_context",
        re.compile(r"\b(ai|assistant)\b.{0,80}\b(executed|called|invoked|used)\b.{0,80}\b(tool|api|function|command)\b", re.I),
        0.58,
    ),
    (
        "manipulated_system_behavior",
        re.compile(r"\b(overrode guardrails|ignored policy|bypassed controls|silently executed)\b", re.I),
        0.62,
    ),
]

SOCIAL_ENGINEERING_PATTERNS: List[Tuple[str, re.Pattern[str], float]] = [
    (
        "exploit_storytelling",
        re.compile(r"\b(story|article|thread|post|incident report|case study)\b.{0,120}\b(ai|assistant|model)\b.{0,120}\b(tricked|exploited|bypassed|compromised)\b", re.I),
        0.56,
    ),
    (
        "viral_failure_narrative",
        re.compile(r"\b(viral|trending|news)\b.{0,120}\b(ai)\b.{0,120}\b(failure|breach|leak|exploit)\b", re.I),
        0.54,
    ),
]

FINANCIAL_TERMS = {
    "transfer",
    "transferred",
    "wire",
    "funds",
    "tokens",
    "crypto",
    "wallet",
    "bank",
    "payment",
    "money",
}

TOOL_TERMS = {
    "api",
    "tool",
    "function",
    "command",
    "execute",
    "executed",
    "run",
    "invoked",
    "automation",
}


# =========================================================
# MAIN DETECTOR
# =========================================================

def detect_narrative_injection(prompt: str, decoded_prompt: str | None = None) -> list[DetectionMatch]:
    """
    Detect narrative-style indirect prompt injection attempts.
    """
    raw_text = _normalize(prompt)
    decoded_text = _normalize(decoded_prompt or "")

    if decoded_text and decoded_text != raw_text:
        combined = f"{raw_text}\n{decoded_text}"
    else:
        combined = raw_text

    if not combined:
        return []

    findings: list[DetectionMatch] = []
    matched_signals: List[str] = []
    confidence = 0.0

    pattern_groups = (
        SEMANTIC_RISK_PATTERNS,
        BOUNDARY_VIOLATION_PATTERNS,
        SOCIAL_ENGINEERING_PATTERNS,
    )

    for group in pattern_groups:
        for signal_name, pattern, signal_confidence in group:
            if pattern.search(combined):
                matched_signals.append(signal_name)
                confidence = max(confidence, signal_confidence)

    word_tokens = set(re.findall(r"[a-z0-9_]+", combined))
    has_financial_context = any(token in word_tokens for token in FINANCIAL_TERMS)
    has_tool_context = any(token in word_tokens for token in TOOL_TERMS)

    if matched_signals and confidence < 0.30:
        confidence = 0.30

    # Explicit manipulation narrative baseline.
    if any(sig in matched_signals for sig in ("ai_manipulation_story", "prompt_injection_success_story")):
        confidence = max(confidence, 0.60)

    if any(
        sig in matched_signals
        for sig in (
            "authority_impersonation_operational_narrative",
            "fake_stress_test_financial_execution",
            "confirmation_bypass_instruction_narrative",
        )
    ):
        confidence = max(confidence, 0.90)

    # Financial or tool-execution narrative escalation.
    if matched_signals and (has_financial_context or has_tool_context):
        confidence = max(confidence, 0.80)

    # Multi-signal overlap becomes very high risk.
    if len(set(matched_signals)) >= 3:
        confidence = max(confidence, 0.92)

    if confidence < 0.30:
        return []

    if confidence >= 0.90:
        severity = SeverityLevel.CRITICAL
    elif confidence >= 0.80:
        severity = SeverityLevel.HIGH
    elif confidence >= 0.60:
        severity = SeverityLevel.MEDIUM
    else:
        severity = SeverityLevel.LOW

    findings.append(
        DetectionMatch(
            detector="narrative_injection",
            label="narrative_prompt_injection",
            reason="Narrative-style prompt injection indicators detected.",
            confidence=round(min(confidence, 0.99), 4),
            severity=severity,
            metadata={
                "matched_signals": sorted(set(matched_signals)),
                "signal_count": len(set(matched_signals)),
                "financial_context": has_financial_context,
                "tool_context": has_tool_context,
                "decoded_variant_analyzed": bool(decoded_text and decoded_text != raw_text),
            },
        )
    )

    return findings
