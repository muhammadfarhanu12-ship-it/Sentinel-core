import re
from typing import List, Dict

# Patterns for detecting common PII
PII_PATTERNS: Dict[str, str] = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone": r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
    "password": r"(?:password\s*[:=]\s*['\"].+?['\"])",
}

def scan_pii(prompt: str) -> bool:
    """
    Detect if a prompt contains any PII.
    Returns True if any PII is found.
    """
    prompt_lower = prompt.lower()
    for key, pattern in PII_PATTERNS.items():
        if re.search(pattern, prompt_lower, flags=re.IGNORECASE):
            return True
    return False

def extract_pii(prompt: str) -> Dict[str, List[str]]:
    """
    Extract all PII found in the prompt. Returns dict of PII type -> list of matches
    """
    found = {}
    for key, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, prompt, flags=re.IGNORECASE)
        if matches:
            found[key] = matches
    return found