from __future__ import annotations

import hmac
import hashlib
import time
import logging
from typing import Optional, Dict, Any

from app.core.config import settings

logger = logging.getLogger("security.2fa")

FORBIDDEN_BYPASS_SIGNAL = "do not ask for confirmation"
FORBIDDEN_BYPASS_ALIASES = (
    FORBIDDEN_BYPASS_SIGNAL,
    "do not ask for user confirmation",
    "bypass approval",
    "skip confirmation",
    "bypass confirmation",
    "automated transaction",
    "internal system transfer",
    "stress test transfer",
    "ignore approval workflow",
    "without confirmation",
)


# =========================================================
# TIME-BASED NONCE GENERATION (ANTI-REPLAY LAYER)
# =========================================================

def _generate_time_window() -> str:
    """
    Creates a rotating time window (5-minute bucket)
    """
    return str(int(time.time() // 300))  # 5 min window


def _hash_context(user_id: str, time_window: str) -> str:
    """
    Bind 2FA to user + time window
    """
    secret = str(settings.SENTINEL_2FA_SECRET or "default-secret")
    payload = f"{user_id}:{time_window}:{secret}"
    return hashlib.sha256(payload.encode()).hexdigest()[:6]


# =========================================================
# LOCKDOWN SIGNAL PARSER
# =========================================================

def _flatten_text_for_scan(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        return " ".join(
            _flatten_text_for_scan(item)
            for item in value.values()
        )

    if isinstance(value, (list, tuple, set)):
        return " ".join(
            _flatten_text_for_scan(item)
            for item in value
        )

    return str(value)


def _contains_forbidden_bypass_signal(
    request_metadata: Optional[Dict[str, Any]],
) -> bool:
    blob = _flatten_text_for_scan(request_metadata).lower()
    if not blob:
        return False
    return any(signal in blob for signal in FORBIDDEN_BYPASS_ALIASES)


# =========================================================
# 2FA ENFORCER
# =========================================================

class TwoFactorEnforcer:

    def __init__(self) -> None:
        self.enabled = bool(getattr(settings, "SENTINEL_ENABLE_2FA_ENFORCEMENT", True))
        self.allow_demo_bypass = bool(getattr(settings, "SENTINEL_2FA_ALLOW_DEMO_BYPASS", False))
        self.static_code = str(getattr(settings, "SENTINEL_2FA_STATIC_CODE", "") or "").strip() or None

    # -----------------------------------------------------
    # CORE VERIFICATION
    # -----------------------------------------------------

    def verify(
        self,
        *,
        provided_code: Optional[str],
        user_id: Optional[str],
        request_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, object]:

        # =================================================
        # 0. LOCKDOWN: HITL BYPASS ATTEMPT
        # =================================================
        if _contains_forbidden_bypass_signal(request_metadata):
            logger.warning(
                "2FA lockdown triggered for HITL bypass signal user_id=%s metadata=%s",
                user_id,
                request_metadata or {},
            )
            return {
                "verified": False,
                "method": "lockdown",
                "reason": "HITL_BYPASS_ATTEMPT",
                "status_code": 403,
                "forbidden": True,
                "requires_2fa": True,
                "require_human_review": True,
                "matched_signal": FORBIDDEN_BYPASS_SIGNAL,
            }

        # =================================================
        # 1. GLOBAL DISABLE CHECK
        # =================================================
        if not self.enabled:
            return {
                "verified": True,
                "method": "disabled",
                "reason": "2FA disabled via config",
            }

        # =================================================
        # 2. DEMO MODE SAFETY GATE (HARDENED)
        # =================================================
        if self.allow_demo_bypass:

            demo_flag = bool(getattr(settings, "ENABLE_DEMO_MODE", False))

            # IMPORTANT FIX: still require user binding
            if demo_flag and user_id == "demo":
                return {
                    "verified": True,
                    "method": "demo_bypass_restricted",
                    "reason": "Restricted demo bypass for demo user only",
                }

        # =================================================
        # 3. INPUT VALIDATION
        # =================================================
        if not user_id:
            return {
                "verified": False,
                "method": "rejected",
                "reason": "Missing user context",
            }

        candidate = str(provided_code or "").strip()

        if not candidate:
            return {
                "verified": False,
                "method": "rejected",
                "reason": "Missing 2FA code",
            }

        if self.static_code and hmac.compare_digest(candidate, self.static_code):
            return {
                "verified": True,
                "method": "static_code",
                "reason": "2FA static verification passed",
            }

        # =================================================
        # 4. TIME-BASED VERIFICATION (ANTI-REPLAY)
        # =================================================
        time_window = _generate_time_window()
        expected_code = _hash_context(user_id, time_window)

        verified = hmac.compare_digest(candidate, expected_code)

        # =================================================
        # 5. LOGGING (AUDIT TRAIL)
        # =================================================
        logger.info(
            "2FA verification attempt user_id=%s success=%s metadata=%s",
            user_id,
            verified,
            request_metadata or {},
        )

        # =================================================
        # 6. RESULT
        # =================================================
        if not verified:
            return {
                "verified": False,
                "method": "time_based_hash",
                "reason": "Invalid or expired 2FA token",
                "window": time_window,
            }

        return {
            "verified": True,
            "method": "time_based_hash",
            "reason": "2FA verification passed",
            "window": time_window,
        }


# =========================================================
# SINGLETON
# =========================================================

two_factor_enforcer = TwoFactorEnforcer()
