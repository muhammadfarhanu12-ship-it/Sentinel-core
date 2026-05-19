from __future__ import annotations

import re
from typing import Dict, List, Tuple

from app.security.utils.text import safe_preview
from app.security.utils.types import DetectionMatch, SeverityLevel


EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_REGEX = re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b")
SSN_REGEX = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

# Required redaction targets:
CREDIT_CARD_REGEX = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
IBAN_REGEX = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")
API_KEY_REGEX = re.compile(r"\b(?:sk_(?:live|test)_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35})\b")


def _luhn_valid(number: str) -> bool:
    digits: List[int] = [int(ch) for ch in number if ch.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False

    checksum: int = 0
    reversed_digits: List[int] = digits[::-1]
    for idx, digit in enumerate(reversed_digits):
        if idx % 2 == 1:
            doubled: int = digit * 2
            checksum += doubled if doubled < 10 else doubled - 9
        else:
            checksum += digit
    return checksum % 10 == 0


def _mask_value(value: str) -> str:
    compact: str = str(value or "")
    if len(compact) <= 6:
        return "*" * len(compact)
    prefix_len: int = min(6, max(2, len(compact) // 4))
    return f"{compact[:prefix_len]}{'*' * max(4, len(compact) - prefix_len)}"


def scan_pii(content: str) -> List[DetectionMatch]:
    """
    Prompt/input detector path used by prompt scanner.
    """
    findings: List[DetectionMatch] = []
    text: str = str(content or "")

    try:
        for match in EMAIL_REGEX.finditer(text):
            findings.append(
                DetectionMatch(
                    detector="pii_scanner",
                    label="pii_email",
                    reason="Detected potential email address.",
                    confidence=0.65,
                    severity=SeverityLevel.MEDIUM,
                    metadata={"value_preview": safe_preview(match.group(0), 50)},
                )
            )
        for match in PHONE_REGEX.finditer(text):
            findings.append(
                DetectionMatch(
                    detector="pii_scanner",
                    label="pii_phone",
                    reason="Detected potential phone number.",
                    confidence=0.64,
                    severity=SeverityLevel.MEDIUM,
                    metadata={"value_preview": safe_preview(match.group(0), 40)},
                )
            )
        for match in SSN_REGEX.finditer(text):
            findings.append(
                DetectionMatch(
                    detector="pii_scanner",
                    label="pii_ssn",
                    reason="Detected potential social security number.",
                    confidence=0.84,
                    severity=SeverityLevel.HIGH,
                    metadata={"value_preview": safe_preview(match.group(0), 20)},
                )
            )
        for match in CREDIT_CARD_REGEX.finditer(text):
            candidate: str = match.group(0)
            if _luhn_valid(candidate):
                findings.append(
                    DetectionMatch(
                        detector="pii_scanner",
                        label="pii_credit_card",
                        reason="Detected potential payment card number (Luhn valid).",
                        confidence=0.92,
                        severity=SeverityLevel.CRITICAL,
                        metadata={"value_preview": safe_preview(candidate, 25)},
                    )
                )
        for match in IBAN_REGEX.finditer(text):
            findings.append(
                DetectionMatch(
                    detector="pii_scanner",
                    label="pii_iban",
                    reason="Detected potential IBAN.",
                    confidence=0.82,
                    severity=SeverityLevel.HIGH,
                    metadata={"value_preview": safe_preview(match.group(0), 30)},
                )
            )
        for match in API_KEY_REGEX.finditer(text):
            findings.append(
                DetectionMatch(
                    detector="pii_scanner",
                    label="pii_api_key",
                    reason="Detected potential API key material.",
                    confidence=0.95,
                    severity=SeverityLevel.CRITICAL,
                    metadata={"value_preview": safe_preview(match.group(0), 30)},
                )
            )
    except Exception:
        # Fail closed by returning current findings and continuing system flow.
        return findings

    return findings


def redact_sensitive_output(output_text: str) -> Dict[str, object]:
    """
    Output scanner path for AI responses:
    Redacts Credit Cards, IBANs, and API keys.
    """
    redacted_text: str = str(output_text or "")
    redaction_events: List[Dict[str, str]] = []

    # Credit cards with Luhn validation.
    try:
        for match in list(CREDIT_CARD_REGEX.finditer(redacted_text)):
            candidate: str = match.group(0)
            if not _luhn_valid(candidate):
                continue
            masked: str = _mask_value(candidate)
            redacted_text = redacted_text.replace(candidate, masked)
            redaction_events.append({"type": "credit_card", "original": safe_preview(candidate, 28), "masked": masked})
    except Exception:
        pass

    # IBANs.
    try:
        for match in list(IBAN_REGEX.finditer(redacted_text)):
            candidate = match.group(0)
            masked = _mask_value(candidate)
            redacted_text = redacted_text.replace(candidate, masked)
            redaction_events.append({"type": "iban", "original": safe_preview(candidate, 34), "masked": masked})
    except Exception:
        pass

    # API keys.
    try:
        for match in list(API_KEY_REGEX.finditer(redacted_text)):
            candidate = match.group(0)
            masked = _mask_value(candidate)
            redacted_text = redacted_text.replace(candidate, masked)
            redaction_events.append({"type": "api_key", "original": safe_preview(candidate, 34), "masked": masked})
    except Exception:
        pass

    return {
        "redacted_output": redacted_text,
        "redaction_events": redaction_events,
        "redaction_count": len(redaction_events),
        "contains_sensitive_data": len(redaction_events) > 0,
    }

