from __future__ import annotations

from typing import Any

__all__ = ["analyze_security_threat", "get_security_analysis"]


def get_security_analysis(*args: Any, **kwargs: Any):
    from .ai_service import get_security_analysis as _get_security_analysis

    return _get_security_analysis(*args, **kwargs)


def analyze_security_threat(*args: Any, **kwargs: Any):
    return get_security_analysis(*args, **kwargs)
