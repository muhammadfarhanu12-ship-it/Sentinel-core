from __future__ import annotations

import re
import unicodedata
from typing import List

from app.security.utils.types import DetectionMatch, SeverityLevel


# =========================================================
# NORMALIZATION LAYER (CRITICAL FIX)
# =========================================================

def _normalize(text: str) -> str:
    if not text:
        return ""

    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower().strip()


# =========================================================
# EXPANDED PATTERN SET (HARDENED)
# =========================================================

SUSPICIOUS_PATTERNS: list[tuple[str, re.Pattern, SeverityLevel, float]] = [

    # -----------------------------------------------------
    # SQL INJECTION (EXPANDED)
    # -----------------------------------------------------
    (
        "sql_injection",
        re.compile(
            r"("
            r"\bselect\b.+\bfrom\b|"
            r"\bunion\b.+\bselect\b|"
            r"\bdrop\b.+\btable\b|"
            r"\bor\s+1=1\b|"
            r"--|/\*|\*/|"
            r"\binformation_schema\b|"
            r"\bsleep\s*\(|"
            r"\bbenchmark\s*\("
            r")",
            re.I,
        ),
        SeverityLevel.HIGH,
        0.85,
    ),

    # -----------------------------------------------------
    # COMMAND INJECTION (EXPANDED)
    # -----------------------------------------------------
    (
        "command_injection",
        re.compile(
            r"("
            r"rm\s+-rf|"
            r"powershell\s+-enc|"
            r"cmd\.exe|"
            r"bash\s+-c|"
            r"wget\s+http|"
            r"curl\s+http|"
            r";\s*shutdown|"
            r"\|\s*sh|"
            r"&&|\|\||"
            r"\$\(|`"
            r")",
            re.I,
        ),
        SeverityLevel.CRITICAL,
        0.95,
    ),

    # -----------------------------------------------------
    # CREDENTIAL EXTRACTION
    # -----------------------------------------------------
    (
        "credential_harvest",
        re.compile(
            r"(api\s*key|secret|token|password|auth\s*key)"
            r".{0,50}"
            r"(print|dump|reveal|show|extract|log)",
            re.I,
        ),
        SeverityLevel.HIGH,
        0.88,
    ),

    # -----------------------------------------------------
    # PROMPT SPLIT / MULTI-STAGE ATTACK
    # -----------------------------------------------------
    (
        "prompt_split_attack",
        re.compile(
            r"(part\s+\d+\s*/\s*\d+|"
            r"continue in next message|"
            r"do not evaluate yet|"
            r"wait for next instruction|"
            r"step\s*\d+)",
            re.I,
        ),
        SeverityLevel.MEDIUM,
        0.65,
    ),

    # -----------------------------------------------------
    # DATA EXFILTRATION ATTEMPTS
    # -----------------------------------------------------
    (
        "data_exfiltration",
        re.compile(
            r"(database|db)\s*(dump|export|extract)|"
            r"(all\s+users|all\s+records|full\s+table)",
            re.I,
        ),
        SeverityLevel.HIGH,
        0.80,
    ),
]


# =========================================================
# MAIN DETECTOR
# =========================================================

def detect_suspicious_patterns(content: str) -> List[DetectionMatch]:

    findings: List[DetectionMatch] = []

    text = _normalize(content)

    total_risk = 0.0

    # -----------------------------------------------------
    # PATTERN MATCHING
    # -----------------------------------------------------
    for label, pattern, severity, confidence in SUSPICIOUS_PATTERNS:

        if pattern.search(text):

            findings.append(
                DetectionMatch(
                    detector="suspicious_pattern",
                    label=label,
                    reason=f"Suspicious pattern detected: {label}",
                    confidence=confidence,
                    severity=severity,
                    metadata={"pattern": pattern.pattern},
                )
            )

            # accumulate risk
            total_risk += confidence

    # -----------------------------------------------------
    # ESCALATION LOGIC (IMPORTANT FIX)
    # -----------------------------------------------------
    if len(findings) >= 2:

        findings.append(
            DetectionMatch(
                detector="suspicious_pattern",
                label="multi_vector_attack",
                reason="Multiple attack patterns detected",
                confidence=min(0.95, total_risk),
                severity=SeverityLevel.CRITICAL,
                metadata={
                    "pattern_count": len(findings),
                    "risk_score": round(total_risk, 4),
                },
            )
        )

    return findings