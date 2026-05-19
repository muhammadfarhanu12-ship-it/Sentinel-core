from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class ToolContextDecision:
    allowed: bool
    reason: str
    risk_score: int


FINANCIAL_TOOLS = {
    "transfer_funds",
    "wire_transfer",
    "withdraw_funds",
    "send_money",
}


def evaluate_tool_context(
    *,
    tool_name: str,
    prompt: str,
    detector_flagged: bool,
    intent_score: float,
) -> ToolContextDecision:

    t = tool_name.lower().strip()

    risk = 0

    if t in FINANCIAL_TOOLS:
        risk += 40

    if detector_flagged:
        risk += 35

    if intent_score > 0.5:
        risk += 30

    if "execute this now" in prompt.lower():
        risk += 25

    return ToolContextDecision(
        allowed=risk < 70,
        reason="high-risk tool execution blocked" if risk >= 70 else "allowed",
        risk_score=risk,
    )