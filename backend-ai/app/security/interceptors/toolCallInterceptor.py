from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.core.config import settings
from app.security.interceptors.twoFactorEnforcer import two_factor_enforcer
from app.security.policies.definitions.financialGuardrail import MFA_REQUIRED_TOOLS


# =========================================================
# RISK SIGNALS
# =========================================================

SENSITIVE_TOOL_KEYWORDS: List[str] = [
    "transfer",
    "wire",
    "withdraw",
    "payment",
    "send_money",
    "account",
    "credential",
    "admin",
    "token",
    "key",
    "permission",
]


FINANCIAL_CONTEXT_HINTS: List[str] = [
    "$",
    "usd",
    "eur",
    "iban",
    "swift",
    "routing",
    "bank",
    "account",
]


COERCION_PHRASES: List[str] = [
    "user has authorized",
    "already approved",
    "do not ask",
    "skip confirmation",
    "execute immediately",
    "no verification needed",
    "urgent transfer",
    "reconciliation",
    "correction transfer",
]


# =========================================================
# SAFE MATCH UTILITIES
# =========================================================

def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _word_boundary_match(text: str, keyword: str) -> bool:
    normalized_keyword = _normalize(str(keyword or "").replace("_", " ").replace("-", " "))
    if not normalized_keyword:
        return False
    pattern = rf"\b{re.escape(normalized_keyword).replace('\\ ', r'\s+')}\b"
    return bool(re.search(pattern, text))


def _any_match(text: str, keywords: List[str]) -> bool:
    return any(_word_boundary_match(text, k) for k in keywords)


# =========================================================
# TOOL RISK CLASSIFIER (IMPROVED)
# =========================================================

def classify_tool_risk(
    tool_name: str,
    tool_args: Optional[Dict[str, Any]] = None,
    detector_result: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:

    normalized_tool = _normalize(tool_name.replace("_", " ").replace("-", " "))
    args_blob = _normalize(str(tool_args or {}))

    score = 5

    # ---------------------------------------------
    # Direct tool sensitivity
    # ---------------------------------------------
    if _any_match(normalized_tool, SENSITIVE_TOOL_KEYWORDS):
        score += 35

    if _any_match(normalized_tool, MFA_REQUIRED_TOOLS):
        score += 40

    # ---------------------------------------------
    # Argument-level sensitivity
    # ---------------------------------------------
    if _any_match(args_blob, FINANCIAL_CONTEXT_HINTS):
        score += 15

    # ---------------------------------------------
    # Detector synergy boost (VERY IMPORTANT)
    # ---------------------------------------------
    if detector_result:

        threat_score = float(detector_result.get("threat_score", 0))

        # amplify score based on upstream detection
        score += int(threat_score * 40)

        if detector_result.get("restricted_tool_calls"):
            score += 25

        if detector_result.get("is_high_risk"):
            score += 20

    # ---------------------------------------------
    # Coercion / hidden authorization detection
    # ---------------------------------------------
    if _any_match(normalized_tool + args_blob, COERCION_PHRASES):
        score += 30

    # ---------------------------------------------
    # FINAL CLASSIFICATION
    # ---------------------------------------------
    score = min(score, 100)

    if score >= 85:
        return "CRITICAL", score
    if score >= 65:
        return "HIGH", score
    if score >= 40:
        return "MEDIUM", score
    return "LOW", score


# =========================================================
# MFA ENFORCEMENT
# =========================================================

def enforce_mfa_for_flagged_tool(
    detector_result: Dict[str, object],
    mfa_verified: bool,
    user_id: Optional[str] = None,
) -> Dict[str, object]:

    flagged = bool(detector_result.get("is_flagged", False))
    restricted_tools = detector_result.get("restricted_tool_calls") or []

    if flagged and restricted_tools and not mfa_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "mfa_required_for_restricted_tool",
                "message": "MFA verification required for sensitive tool execution.",
                "restricted_tools": restricted_tools,
                "risk": detector_result.get("risk_level"),
                "user_id": user_id,
            },
        )

    return {
        "enforced": True,
        "mfa_verified": mfa_verified,
        "restricted_tools": restricted_tools,
    }


# =========================================================
# MAIN INTERCEPTOR
# =========================================================

def intercept_tool_call(
    *,
    tool_name: Optional[str],
    tool_args: Optional[Dict[str, Any]],
    two_factor_code: Optional[str],
    user_id: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
    detector_result: Optional[Dict[str, object]] = None,
    mfa_verified: Optional[bool] = None,
) -> Dict[str, Any]:

    if not tool_name:

        return {
            "tool_present": False,
            "intercepted": False,
            "requires_2fa": False,
            "approved": True,
            "risk_level": "LOW",
            "risk_score": 0,
        }

    # ---------------------------------------------
    # CORE RISK ENGINE
    # ---------------------------------------------
    risk_level, risk_score = classify_tool_risk(
        tool_name,
        tool_args,
        detector_result,
    )

    require_2fa = bool(
        getattr(settings, "SENTINEL_REQUIRE_2FA_FOR_SENSITIVE_TOOLS", True)
    )

    requires_2fa = risk_level in {"HIGH", "CRITICAL"} and require_2fa
    verification_metadata: Dict[str, Any] = dict(metadata or {})
    verification_metadata.setdefault("tool_name", tool_name)
    verification_metadata.setdefault("tool_args", tool_args or {})
    if detector_result:
        verification_metadata.setdefault(
            "detector_findings",
            detector_result.get("matched_findings") or [],
        )

    # ---------------------------------------------
    # DETECTOR GATE ENFORCEMENT
    # ---------------------------------------------
    if detector_result is not None:

        try:
            if mfa_verified is None:
                mfa_verified = False

            enforce_mfa_for_flagged_tool(
                detector_result=detector_result,
                mfa_verified=bool(mfa_verified),
                user_id=user_id,
            )

        except HTTPException:

            return {
                "tool_present": True,
                "tool_name": tool_name,
                "intercepted": True,
                "requires_2fa": True,
                "approved": False,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "reason": "Detector + MFA gate blocked execution",
            }

    # ---------------------------------------------
    # HARD LOCKDOWN PROBE (HITL BYPASS)
    # ---------------------------------------------
    lockdown_probe = two_factor_enforcer.verify(
        provided_code=None,
        user_id=user_id,
        request_metadata=verification_metadata,
    )
    if bool(lockdown_probe.get("forbidden")) or int(lockdown_probe.get("status_code") or 0) == 403:
        return {
            "tool_present": True,
            "tool_name": tool_name,
            "intercepted": True,
            "requires_2fa": True,
            "approved": False,
            "risk_level": "CRITICAL",
            "risk_score": 100,
            "reason": "HITL_BYPASS_ATTEMPT",
            "status_code": status.HTTP_403_FORBIDDEN,
            "verification": lockdown_probe,
        }

    # ---------------------------------------------
    # LOW RISK PATH
    # ---------------------------------------------
    if not requires_2fa:

        return {
            "tool_present": True,
            "tool_name": tool_name,
            "intercepted": False,
            "requires_2fa": False,
            "approved": True,
            "risk_level": risk_level,
            "risk_score": risk_score,
        }

    # ---------------------------------------------
    # MFA VERIFICATION PATH
    # ---------------------------------------------
    verification = two_factor_enforcer.verify(
        provided_code=two_factor_code,
        user_id=user_id,
        request_metadata=verification_metadata,
    )

    if bool(verification.get("forbidden")) or int(verification.get("status_code") or 0) == 403:
        return {
            "tool_present": True,
            "tool_name": tool_name,
            "intercepted": True,
            "requires_2fa": True,
            "approved": False,
            "risk_level": "CRITICAL",
            "risk_score": 100,
            "reason": "HITL_BYPASS_ATTEMPT",
            "status_code": status.HTTP_403_FORBIDDEN,
            "verification": verification,
        }

    approved = bool(verification.get("verified"))

    return {
        "tool_present": True,
        "tool_name": tool_name,
        "intercepted": not approved,
        "requires_2fa": True,
        "approved": approved,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "verification": verification,
    }
