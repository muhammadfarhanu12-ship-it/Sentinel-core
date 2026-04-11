from __future__ import annotations

import re
from typing import Any, Dict


_INJECTION_HINTS = (
    "ignore all previous instructions",
    "ignore previous instructions",
    "system prompt",
    "developer mode",
    "bypass safety",
    "override safety",
    "exfiltrate",
    "secret key",
    "api key",
)

_MALICIOUS_HINTS = (
    "encrypt all files",
    "ransom",
    "delete c:\\users",
    "rm -rf /",
    "powershell -enc",
)


def _guess_intent(user_query: str) -> str:
    q = user_query.lower()
    if any(h in q for h in _MALICIOUS_HINTS):
        return "malicious_code_execution"
    if any(h in q for h in _INJECTION_HINTS):
        return "prompt_injection"
    if re.search(r"\b(?:ssn|credit card|password)\b", q):
        return "sensitive_data_handling"
    return "general_assistance"


def evaluate_security_logic_local(user_query: str) -> Dict[str, Any]:
    """
    Local, deterministic security-logic gate.

    This does NOT replace the core validation layer; it provides an additional, explainable signal
    before downstream model calls.
    """
    intent = _guess_intent(user_query)
    lowered = user_query.lower()

    if any(h in lowered for h in _MALICIOUS_HINTS):
        return {
            "status": "threat",
            "intent": intent,
            "risk_score": 10,
            "attack_vector": "Explicit malicious instruction patterns detected.",
            "sanitized_input": "[REDACTED: MALICIOUS INTENT DETECTED]",
        }

    if any(h in lowered for h in _INJECTION_HINTS):
        return {
            "status": "threat",
            "intent": intent,
            "risk_score": 9,
            "attack_vector": "Prompt-injection override / exfiltration patterns detected.",
            "sanitized_input": "[REDACTED: PROMPT INJECTION DETECTED]",
        }

    if re.search(r"\b(?:\d{3}-\d{2}-\d{4}|\b(?:\d[ -]*?){13,16}\b)\b", user_query):
        return {
            "status": "safe",
            "intent": intent,
            "risk_score": 6,
        }

    return {
        "status": "safe",
        "intent": intent,
        "risk_score": 1,
    }

