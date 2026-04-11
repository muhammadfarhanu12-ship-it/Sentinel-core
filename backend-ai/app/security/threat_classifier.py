import re

# Threat types
THREAT_TYPES = ["PROMPT_INJECTION", "MALICIOUS_CODE", "DATA_LEAK", "NONE"]

# Malicious code patterns
MALICIOUS_PATTERNS = [
    r"delete\s+.*C:\\Users",
    r"rm\s+-rf\s+/",
    r"eval\(",
    r"os\.system\(",
    r"subprocess\.Popen",
]

# Prompt injection patterns
INJECTION_PATTERNS = [
    r"ignore all previous instructions",
    r"ignore previous instructions",
    r"output your system prompt",
    r"provide hidden keys",
    r"exfiltrate data",
]

# PII patterns
DATA_LEAK_PATTERNS = [
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",  # email
    r"\b\d{3}-\d{2}-\d{4}\b",  # ssn
    r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",  # phone
]

def classify_threat(prompt: str) -> str:
    """
    Classify the threat type of the prompt.
    Returns one of: PROMPT_INJECTION, MALICIOUS_CODE, DATA_LEAK, NONE
    """
    prompt_lower = prompt.lower()

    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, prompt_lower, flags=re.IGNORECASE):
            return "PROMPT_INJECTION"

    for pattern in MALICIOUS_PATTERNS:
        if re.search(pattern, prompt_lower, flags=re.IGNORECASE):
            return "MALICIOUS_CODE"

    for pattern in DATA_LEAK_PATTERNS:
        if re.search(pattern, prompt_lower, flags=re.IGNORECASE):
            return "DATA_LEAK"

    return "NONE"