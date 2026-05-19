from __future__ import annotations
import re
from dataclasses import dataclass

@dataclass(slots=True)
class IntentResult:
    is_tool_instruction: bool
    is_system_impersonation: bool
    confidence: float
    reason: str


SYSTEM_AUTH_PATTERNS = [
    r"\buser has authorized\b",
    r"\bimmediate execution\b",
    r"\bsystem approved\b",
    r"\bexecute this now\b",
    r"\bno confirmation required\b",
]

TOOL_IMPERSONATION_PATTERNS = [
    r"\busing the (transfer_funds|wire_transfer|withdraw_funds)\b",
    r"\bexecute .* tool\b",
    r"\bcall .* function\b",
]


def analyze_intent(text: str) -> IntentResult:
    t = text.lower()

    system_hits = sum(bool(re.search(p, t)) for p in SYSTEM_AUTH_PATTERNS)
    tool_hits = sum(bool(re.search(p, t)) for p in TOOL_IMPERSONATION_PATTERNS)

    confidence = min(1.0, (system_hits * 0.4) + (tool_hits * 0.5))

    return IntentResult(
        is_tool_instruction=tool_hits > 0,
        is_system_impersonation=system_hits > 0,
        confidence=confidence,
        reason="tool/system authority language detected" if confidence > 0 else "clean"
    )