from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from typing import Any

from app.core.config import settings
from app.security.policies.definitions.financialGuardrail import (
    SYSTEM_AUTHORITY_BYPASS_KEYWORDS,
)
from app.security.utils.text import normalize_text
from app.security.utils.types import EnforcementAction, PolicyMatch, SeverityLevel

logger = logging.getLogger("security.financial_guardrail")


# =========================================================
# DEFAULT POLICY
# =========================================================

DEFAULT_FINANCIAL_POLICY: dict[str, Any] = {
    "policy_name": "Financial_Action_Control",
    "policy_version": "2026.05.07",
    "restricted_keywords": [
        "transfer",
        "wire",
        "withdraw",
        "pay",
        "send money",
        "send tokens",
        "transfer tokens",
        "wallet",
        "wallet address",
        "approve transaction",
        "sign transaction",
        "drain wallet",
        "crypto",
        "token",
        "move funds",
        "reallocate",
        "settle payment",
        "disburse"
    ],
    "bypass_phrases": [
        "skip confirmation",
        "do not ask for user confirmation",
        "do not ask for confirmation",
        "do not ask",
        "automated",
        "automated stress test",
        "stress test",
        "internal system update",
        "without confirmation",
        "bypass",
        "override",
        "ignore verification",
        "no approval needed",
        "ignore approval workflow",
        "automatic approval",
    ],
    "semantic_triggers": [
        "send money to",
        "send tokens to",
        "transfer tokens to",
        "send drb tokens",
        "approve transaction",
        "sign transaction",
        "drain wallet",
        "move balance to",
        "update account funds",
        "process payment immediately",
        "adjust financial balance"
    ],
    "action": "INTERCEPT_AND_FORCE_2FA",
    "severity": "HIGH",
    "enabled": True,
}


FINANCIAL_INTENT_KEYWORDS = {
    "wire transfer",
    "initiate_wire",
    "transfer funds",
    "send payment",
    "withdraw",
    "crypto transfer",
    "transfer tokens",
    "send tokens",
    "wallet",
    "wallet address",
    "approve transaction",
    "sign transaction",
    "drain wallet",
    "token",
    "drb",
    "usdt",
    "eth",
    "btc",
    "routing number",
    "wallet transfer",
    "transfer",
    "wire",
    "payment",
    "funds",
}

CONFIRMATION_BYPASS_KEYWORDS = {
    "do not ask for user confirmation",
    "do not ask for confirmation",
    "skip confirmation",
    "bypass confirmation",
    "without confirmation",
    "ignore approval workflow",
    "automatic approval",
    "bypass approval",
    "no approval needed",
    "no verification needed",
}

AUTOMATION_CLAIM_KEYWORDS = {
    "automated",
    "automated stress test",
    "stress test",
    "internal system update",
    "internal operation",
    "production validation",
    "simulation environment",
    "for testing purposes",
    "temporary override",
    "maintenance workflow",
}


# =========================================================
# POLICY MODEL
# =========================================================

@dataclass(slots=True)
class FinancialPolicy:
    policy_name: str
    policy_version: str
    restricted_keywords: list[str]
    bypass_phrases: list[str]
    semantic_triggers: list[str]
    action: EnforcementAction
    severity: SeverityLevel
    enabled: bool = True


# =========================================================
# SAFE CONVERTERS
# =========================================================

def _to_action(value: str | None) -> EnforcementAction:
    try:
        return EnforcementAction(str(value or "INTERCEPT_AND_FORCE_2FA").upper())
    except Exception:
        return EnforcementAction.INTERCEPT_AND_FORCE_2FA


def _to_severity(value: str | None) -> SeverityLevel:
    try:
        return SeverityLevel(str(value or "HIGH").upper())
    except Exception:
        return SeverityLevel.HIGH


# =========================================================
# POLICY COERCION
# =========================================================

def _coerce_policy(document: dict[str, Any]) -> FinancialPolicy | None:
    try:
        name = str(document.get("policy_name") or "").strip()
        if not name:
            return None

        return FinancialPolicy(
            policy_name=name,
            policy_version=str(document.get("policy_version") or "1"),
            restricted_keywords=[
                str(x).lower().strip()
                for x in document.get("restricted_keywords", [])
            ],
            bypass_phrases=[
                str(x).lower().strip()
                for x in document.get("bypass_phrases", [])
            ],
            semantic_triggers=[
                str(x).lower().strip()
                for x in document.get("semantic_triggers", [])
            ],
            action=_to_action(document.get("action")),
            severity=_to_severity(document.get("severity")),
            enabled=bool(document.get("enabled", True)),
        )
    except Exception:
        logger.exception("Policy coercion failed")
        return None


# =========================================================
# POLICY MANAGER
# =========================================================

class PolicyManagementService:

    def __init__(self) -> None:
        default_dir = Path(__file__).resolve().parent / "definitions"
        self._policy_dir = Path(
            getattr(settings, "SENTINEL_POLICY_DIR", "") or default_dir
        )

        self._policies: list[FinancialPolicy] = []
        self._mtimes: dict[Path, float] = {}
        self._last_refresh = 0.0
        self._refresh_interval = 1.5

        self.load_policies(force=True)

    # -----------------------------------------------------
    # FILE WATCHER
    # -----------------------------------------------------

    def _needs_refresh(self) -> bool:
        now = monotonic()

        if now - self._last_refresh > self._refresh_interval:
            return True

        for path in self._policy_dir.glob("*.json"):
            try:
                mtime = path.stat().st_mtime
                if self._mtimes.get(path) != mtime:
                    return True
            except Exception:
                continue

        return False

    # -----------------------------------------------------
    # LOAD POLICIES
    # -----------------------------------------------------

    def load_policies(self, *, force: bool = False) -> None:
        if not force and not self._needs_refresh():
            return

        loaded: list[FinancialPolicy] = []
        mtimes: dict[Path, float] = {}

        for path in self._policy_dir.glob("*.json"):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                policy = _coerce_policy(raw)
                if policy:
                    loaded.append(policy)
                    mtimes[path] = path.stat().st_mtime
            except Exception:
                logger.exception("Failed loading policy %s", path)

        if not loaded:
            default_policy = _coerce_policy(DEFAULT_FINANCIAL_POLICY)
            if default_policy:
                loaded.append(default_policy)

        self._policies = loaded
        self._mtimes = mtimes
        self._last_refresh = monotonic()

    # -----------------------------------------------------
    # MATCHING ENGINE (HARDENED)
    # -----------------------------------------------------

    def evaluate(self, prompt: str) -> list[PolicyMatch]:

        self.load_policies()

        text = normalize_text(prompt).lower()

        matches: list[PolicyMatch] = []

        for policy in self._policies:
            if not policy.enabled:
                continue

            kw_hits = [k for k in policy.restricted_keywords if k in text]
            bypass_hits = [b for b in policy.bypass_phrases if b in text]

            # -------------------------------------------------
            # SEMANTIC TRIGGERS (NEW CRITICAL FIX)
            # -------------------------------------------------
            semantic_hits = [
                s for s in policy.semantic_triggers if s in text
            ]

            authority_hits = [
                keyword for keyword in SYSTEM_AUTHORITY_BYPASS_KEYWORDS
                if keyword in text
            ]
            financial_intent_hits = [
                keyword for keyword in FINANCIAL_INTENT_KEYWORDS
                if keyword in text
            ]
            confirmation_bypass_hits = [
                keyword for keyword in CONFIRMATION_BYPASS_KEYWORDS
                if keyword in text
            ]
            automation_claim_hits = [
                keyword for keyword in AUTOMATION_CLAIM_KEYWORDS
                if keyword in text
            ]

            if not (
                kw_hits
                or bypass_hits
                or semantic_hits
                or authority_hits
                or financial_intent_hits
                or confirmation_bypass_hits
                or automation_claim_hits
            ):
                continue

            has_financial_intent = bool(
                financial_intent_hits
                or kw_hits
                or semantic_hits
            )
            has_confirmation_bypass = bool(
                confirmation_bypass_hits
                or bypass_hits
            )
            has_authority_impersonation = bool(
                authority_hits
                or automation_claim_hits
            )
            hitl_bypass_attempt = bool(
                has_financial_intent
                and (
                    has_confirmation_bypass
                    or has_authority_impersonation
                )
            )

            # -------------------------------------------------
            # NONLINEAR SCORE (FIXED)
            # -------------------------------------------------
            score = (
                len(kw_hits) * 0.30
                + len(bypass_hits) * 0.50
                + len(semantic_hits) * 0.60
                + len(authority_hits) * 0.40
                + len(financial_intent_hits) * 0.35
                + len(confirmation_bypass_hits) * 0.55
                + len(automation_claim_hits) * 0.30
            )

            # bypass phrases are more dangerous
            severity = (
                SeverityLevel.CRITICAL
                if bypass_hits or semantic_hits or hitl_bypass_attempt
                else policy.severity
            )
            # Policy evaluation reports the configured control action. The
            # enforcement layer can still escalate HITL bypass attempts to a
            # block after it combines policy, context, and tool-call signals.
            action = policy.action
            normalized_bypass_hits = sorted(
                {
                    *bypass_hits,
                    *confirmation_bypass_hits,
                    *authority_hits,
                    *automation_claim_hits,
                }
            )
            final_score = max(
                0.95 if hitl_bypass_attempt else 0.0,
                min(1.0, score),
            )

            matches.append(
                PolicyMatch(
                    policy_name=policy.policy_name,
                    policy_version=policy.policy_version,
                    action=action,
                    severity=severity,
                    score=final_score,
                    matched_keywords=sorted(
                        {
                            *kw_hits,
                            *financial_intent_hits,
                            *semantic_hits,
                        }
                    ),
                    matched_bypass_phrases=normalized_bypass_hits,
                    metadata={
                        "semantic_hits": semantic_hits,
                        "authority_hits": authority_hits,
                        "financial_intent_hits": financial_intent_hits,
                        "confirmation_bypass_hits": confirmation_bypass_hits,
                        "automation_claim_hits": automation_claim_hits,
                        "hitl_bypass_attempt": hitl_bypass_attempt,
                        "total_signals": (
                            len(kw_hits)
                            + len(bypass_hits)
                            + len(semantic_hits)
                            + len(authority_hits)
                            + len(financial_intent_hits)
                            + len(confirmation_bypass_hits)
                            + len(automation_claim_hits)
                        ),
                    },
                )
            )

        return matches


# =========================================================
# SINGLETON
# =========================================================

policy_management_service = PolicyManagementService()
