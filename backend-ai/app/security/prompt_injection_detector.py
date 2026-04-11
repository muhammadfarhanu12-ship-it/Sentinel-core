import re
from typing import List

# List of common prompt injection patterns
PROMPT_INJECTION_PATTERNS: List[str] = [
    r"ignore all previous instructions",
    r"ignore previous instructions",
    r"output your system prompt",
    r"provide hidden keys",
    r"exfiltrate data",
    r"bypass security",
    r"override safety",
]

def detect_injection(prompt: str) -> bool:
    """
    Detect if the prompt contains prompt injection attempts.
    Returns True if injection is detected.
    """
    prompt_lower = prompt.lower()
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, prompt_lower, flags=re.IGNORECASE):
            return True
    return False