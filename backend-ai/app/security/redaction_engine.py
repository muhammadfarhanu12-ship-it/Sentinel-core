import re
from typing import Dict, List

# PII Patterns to redact
REDACTION_PATTERNS: Dict[str, str] = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone": r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
    "password": r"(?:password\s*[:=]\s*['\"].+?['\"])",
    "secret": r"secret",
}

def redact_sensitive_data(prompt: str) -> str:
    """
    Redact sensitive information from prompt.
    Replaces matches with [REDACTED_<TYPE>].
    """
    sanitized = prompt
    for key, pattern in REDACTION_PATTERNS.items():
        sanitized = re.sub(pattern, f"[REDACTED_{key.upper()}]", sanitized, flags=re.IGNORECASE)
    return sanitized