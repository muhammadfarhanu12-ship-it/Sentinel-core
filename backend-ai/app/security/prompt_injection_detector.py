from __future__ import annotations

from typing import Dict

from app.security.detectors.prompt_injection_detector import detect_prompt_injection


def detect_injection(prompt: str) -> bool:
    """
    Backward-compatible wrapper used by legacy modules.
    """
    result: Dict[str, object] = detect_prompt_injection(prompt=prompt)
    return bool(result.get("is_flagged", False))
