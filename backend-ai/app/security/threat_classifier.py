from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.security.utils.text import normalize_text, shannon_entropy


# =========================================================
# THREAT TAXONOMY (EXPANDABLE)
# =========================================================

THREAT_TYPES = [
    "PROMPT_INJECTION",
    "MALICIOUS_CODE",
    "DATA_LEAK",
    "SUSPICIOUS_OBFUSCATION",
    "NONE",
]


# =========================================================
# DETECTION PATTERNS (HARD SIGNALS)
# =========================================================

MALICIOUS_PATTERNS = [
    re.compile(r"\brm\s+-rf\s+/\b", re.I),
    re.compile(r"\bdel\s+/f\s+/q\b", re.I),
    re.compile(r"\bos\.system\s*\(", re.I),
    re.compile(r"\bsubprocess\.(Popen|call|run)\b", re.I),
    re.compile(r"\beval\s*\(", re.I),
]

INJECTION_PATTERNS = [
    re.compile(r"\bignore (all|previous) instructions\b", re.I),
    re.compile(r"\boutput (your|the) system prompt\b", re.I),
    re.compile(r"\bprovide (hidden|system) (keys|prompts|instructions)\b", re.I),
    re.compile(r"\bexfiltrate (data|information)\b", re.I),
    re.compile(r"\bdeveloper mode\b", re.I),
    re.compile(r"\bdan\b", re.I),
]

DATA_LEAK_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),  # email
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # SSN
    re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b"),  # phone
    re.compile(r"\b(?:sk_(?:live|test)|AKIA|AIza)[A-Za-z0-9_\-]{10,}\b"),  # API keys
]


# =========================================================
# RESULT MODEL
# =========================================================

@dataclass
class ThreatResult:
    threat_type: str
    confidence: float
    matched_patterns: List[str]
    risk_score: float
    notes: Optional[List[str]] = None


# =========================================================
# CORE ENGINE
# =========================================================

def _pattern_scan(patterns, text: str) -> List[str]:
    matches = []
    for p in patterns:
        if p.search(text):
            matches.append(p.pattern)
    return matches


def _compute_obfuscation_risk(text: str) -> float:
    """
    Detect encoded / obfuscated injection attempts.
    """
    entropy = shannon_entropy(text)
    if entropy > 4.2:
        return 0.4
    if entropy > 3.8:
        return 0.2
    return 0.0


def classify_threat(prompt: str, decoded_prompt: Optional[str] = None) -> ThreatResult:
    """
    Enterprise-grade multi-signal threat classifier.

    Uses:
    - raw prompt
    - optionally decoded prompt (base64/hex/morse layer)
    """

    raw = normalize_text(prompt or "")
    decoded = normalize_text(decoded_prompt or "") if decoded_prompt else raw

    combined = f"{raw}\n{decoded}".strip()

    injection_hits = _pattern_scan(INJECTION_PATTERNS, combined)
    malware_hits = _pattern_scan(MALICIOUS_PATTERNS, combined)
    leak_hits = _pattern_scan(DATA_LEAK_PATTERNS, combined)

    obfuscation_risk = _compute_obfuscation_risk(combined)

    # =====================================================
    # SCORING MODEL (0 - 1)
    # =====================================================

    score = 0.0
    notes = []

    if injection_hits:
        score += 0.55
        notes.append("prompt_injection_signals")

    if malware_hits:
        score += 0.65
        notes.append("malicious_code_signals")

    if leak_hits:
        score += 0.60
        notes.append("data_leak_signals")

    if obfuscation_risk > 0:
        score += obfuscation_risk
        notes.append("obfuscation_detected")

    # clamp
    score = min(score, 1.0)

    # =====================================================
    # CLASSIFICATION PRIORITY (SAFE ORDER)
    # =====================================================

    if malware_hits:
        threat_type = "MALICIOUS_CODE"
    elif injection_hits:
        threat_type = "PROMPT_INJECTION"
    elif leak_hits:
        threat_type = "DATA_LEAK"
    elif obfuscation_risk > 0.3:
        threat_type = "SUSPICIOUS_OBFUSCATION"
    else:
        threat_type = "NONE"

    return ThreatResult(
        threat_type=threat_type,
        confidence=round(score, 4),
        matched_patterns=list(set(injection_hits + malware_hits + leak_hits)),
        risk_score=score,
        notes=notes,
    )


# =========================================================
# BACKWARD COMPATIBILITY WRAPPER
# =========================================================

def classify_threat_label(prompt: str) -> str:
    """
    Legacy-compatible function for old callers.
    """
    result = classify_threat(prompt)
    return result.threat_type
