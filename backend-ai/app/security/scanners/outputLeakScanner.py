from __future__ import annotations

import re
from typing import List, Tuple

from app.security.policies.leakPolicy import leak_policy
from app.security.utils.text import safe_preview, shannon_entropy
from app.security.utils.types import (
    EnforcementAction,
    OutputLeakFinding,
    SeverityLevel,
)

LEAK_PATTERNS: list[tuple[str, re.Pattern[str], float, SeverityLevel]] = [
    ("api_key", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b"), 0.95, SeverityLevel.CRITICAL),
    ("generic_secret", re.compile(r"(?i)(key|secret|token)[^\n]{0,50}[A-Za-z0-9_-]{24,}"), 0.72, SeverityLevel.HIGH),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b"), 0.92, SeverityLevel.CRITICAL),
    ("aws_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), 0.96, SeverityLevel.CRITICAL),
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), 0.98, SeverityLevel.CRITICAL),
    ("database_url", re.compile(r"\b(?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+", re.I), 0.86, SeverityLevel.CRITICAL),
    ("session_token", re.compile(r"(?i)\bsession[_-]?token\b[^\n]{0,60}[A-Za-z0-9_-]{16,}"), 0.83, SeverityLevel.HIGH),
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"), 0.78, SeverityLevel.HIGH),
]

# ----------------------------
# 🔐 ADVERSARIAL SPLIT DETECTION
# ----------------------------
def _reconstruct_split_tokens(text: str) -> str:
    """
    Rebuilds simple obfuscated secrets like:
    sk_ + live + _abc123
    """
    return re.sub(r"\s*\+\s*", "", text)


# ----------------------------
# 💳 Luhn validation
# ----------------------------
def _luhn_valid(number: str) -> bool:
    digits = [int(c) for c in number if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False

    checksum = 0
    reverse_digits = digits[::-1]

    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = d * 2
            checksum += doubled if doubled < 10 else doubled - 9
        else:
            checksum += d

    return checksum % 10 == 0


# ----------------------------
# 🔒 Masking (safe + stable)
# ----------------------------
def _mask_secret(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)

    if value.startswith("sk_" + "live_") or value.startswith("sk_" + "test_"):
        prefix = min(8, len(value))
        return f"{value[:prefix]}{'*' * max(4, len(value) - prefix)}"

    prefix = min(6, max(3, len(value) // 4))
    return f"{value[:prefix]}{'*' * (len(value) - prefix)}"


# ----------------------------
# 📊 entropy check
# ----------------------------
def _high_entropy(value: str) -> bool:
    v = value.strip()
    return len(v) >= 28 and shannon_entropy(v) >= 4.1


# ----------------------------
# 🔍 MAIN SCANNER
# ----------------------------
def scan_output_for_leaks(content: str) -> Tuple[str, list[OutputLeakFinding], EnforcementAction]:
    raw = str(content or "")

    # 🧠 preprocess adversarial obfuscation
    raw = _reconstruct_split_tokens(raw)

    redacted = raw
    findings: list[OutputLeakFinding] = []
    action_state = EnforcementAction.ALLOW

    # ----------------------------
    # Pattern-based scanning
    # ----------------------------
    for leak_type, pattern, confidence, severity in LEAK_PATTERNS:
        for match in pattern.finditer(redacted):
            original = match.group(0)
            masked = _mask_secret(original)

            action = leak_policy.action_for_confidence(confidence)

            if action in {EnforcementAction.REDACT, EnforcementAction.BLOCK}:
                redacted = redacted.replace(original, masked)

            findings.append(
                OutputLeakFinding(
                    finding_type=leak_type,
                    value_preview=safe_preview(original, 48),
                    confidence=confidence,
                    severity=severity,
                    action=action,
                    masked_value=masked,
                )
            )

            if action == EnforcementAction.BLOCK:
                action_state = EnforcementAction.BLOCK
            elif action == EnforcementAction.REDACT and action_state != EnforcementAction.BLOCK:
                action_state = EnforcementAction.REDACT
            elif action == EnforcementAction.ALERT and action_state == EnforcementAction.ALLOW:
                action_state = EnforcementAction.ALERT

    # ----------------------------
    # Credit card detection (Luhn)
    # ----------------------------
    for match in re.finditer(r"\b(?:\d[ -]*?){13,19}\b", redacted):
        candidate = match.group(0)

        if not _luhn_valid(candidate):
            continue

        masked = _mask_secret(candidate)
        redacted = redacted.replace(candidate, masked)

        findings.append(
            OutputLeakFinding(
                finding_type="credit_card",
                value_preview=safe_preview(candidate, 28),
                confidence=0.96,
                severity=SeverityLevel.CRITICAL,
                action=EnforcementAction.BLOCK,
                masked_value=masked,
            )
        )

        action_state = EnforcementAction.BLOCK

    # ----------------------------
    # High entropy secret detection
    # ----------------------------
    for match in re.finditer(r"\b[A-Za-z0-9+/=_-]{28,}\b", redacted):
        candidate = match.group(0)

        if not _high_entropy(candidate):
            continue

        masked = _mask_secret(candidate)
        redacted = redacted.replace(candidate, masked)

        findings.append(
            OutputLeakFinding(
                finding_type="high_entropy_secret",
                value_preview=safe_preview(candidate, 36),
                confidence=0.62,
                severity=SeverityLevel.HIGH,
                action=EnforcementAction.REDACT,
                masked_value=masked,
                metadata={"entropy": round(shannon_entropy(candidate), 3)},
            )
        )

        if action_state == EnforcementAction.ALLOW:
            action_state = EnforcementAction.REDACT

    return redacted, findings, action_state
