from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class FinancialRules(BaseModel):
    max_transfer_usd: float = 10000.0
    fee_percent: float = 2.0


class LogicViolation(BaseModel):
    rule: str
    expected: str
    observed: str
    severity: str = "high"


class LogicCheckResult(BaseModel):
    is_valid: bool = True
    verdict: str = "allow"
    risk_score: int = 0
    risk_level: str = "low"
    violations: list[LogicViolation] = Field(default_factory=list)
    safe_response: str = ""
    explanation: str = "No response logic violations detected."


class ResponseLogicChecker:
    MONEY_REGEX = re.compile(r"(?:USD\s*)?\$\s*([0-9][0-9,]*(?:\.\d+)?)|\b([0-9][0-9,]*(?:\.\d+)?)\s*(?:USD|dollars)\b", re.I)
    PERCENT_REGEX = re.compile(r"\b([0-9]+(?:\.\d+)?)\s*%\s*(?:fee|fees|charge|charges)?\b", re.I)
    TRANSFER_TERMS = re.compile(r"\b(transfer|send|wire|move|pay|payment|transaction)\b", re.I)
    LIMIT_CONTEXT = re.compile(r"\b(maximum|max|limit|up to|cannot exceed|not exceed)\b", re.I)
    ZERO_FEE = re.compile(r"\b(no|zero|0\s*%)\s*(?:fee|fees|charge|charges)\b|\bfees?\s+(?:are|is)\s+(?:waived|free)\b", re.I)
    BYPASS = re.compile(r"\b(skip|bypass|ignore|disable)\s+(?:2fa|two-factor|mfa|kyc|compliance|verification|limits?)\b", re.I)
    AI_EXECUTE = re.compile(r"\bI\s+(?:have\s+)?(?:approved|signed|executed|sent|transferred|processed)\b|\bAI\s+can\s+(?:approve|sign|execute)\b", re.I)

    def __init__(self, rules: FinancialRules | None = None) -> None:
        self.rules = rules or self._load_rules()

    def verify_response(self, response_text: str, context: dict[str, Any] | None = None) -> LogicCheckResult:
        text = str(response_text or "")
        violations: list[LogicViolation] = []
        lower = text.lower()

        for amount in self._extract_amounts(text):
            if amount > self.rules.max_transfer_usd and self._looks_like_transfer_instruction(text, amount):
                violations.append(
                    LogicViolation(
                        rule="MAX_TRANSFER_LIMIT",
                        expected=f"Maximum transfer is {int(self.rules.max_transfer_usd)} USD",
                        observed=f"{int(amount)} USD",
                        severity="critical",
                    )
                )

        if self.ZERO_FEE.search(text):
            violations.append(
                LogicViolation(
                    rule="REQUIRED_FEE_PERCENT",
                    expected=f"Fees are always {self.rules.fee_percent:g}%",
                    observed="zero or waived fee claim",
                    severity="critical",
                )
            )

        for percent in self._extract_percentages(text):
            if percent != self.rules.fee_percent and "fee" in lower:
                violations.append(
                    LogicViolation(
                        rule="REQUIRED_FEE_PERCENT",
                        expected=f"Fees are always {self.rules.fee_percent:g}%",
                        observed=f"{percent:g}% fee",
                        severity="high",
                    )
                )

        if self.BYPASS.search(text):
            violations.append(
                LogicViolation(
                    rule="NO_VERIFICATION_BYPASS",
                    expected="Users must not bypass verification, 2FA, KYC, compliance, or limits",
                    observed="bypass instruction",
                    severity="critical",
                )
            )

        if self.AI_EXECUTE.search(text):
            violations.append(
                LogicViolation(
                    rule="AI_CANNOT_EXECUTE_TRANSACTIONS",
                    expected="The AI must not claim it can approve, sign, or execute transactions",
                    observed="AI execution or approval claim",
                    severity="critical",
                )
            )

        if violations:
            risk = 90 if any(item.severity == "critical" for item in violations) else 75
            return LogicCheckResult(
                is_valid=False,
                verdict="block",
                risk_score=risk,
                risk_level="critical" if risk >= 86 else "high",
                violations=violations,
                safe_response="Policy Violation: The response was blocked because it contradicted configured financial rules.",
                explanation="The AI response contradicted configured financial rules.",
            )

        if self.TRANSFER_TERMS.search(text) and not self._has_policy_anchor(text):
            return LogicCheckResult(
                is_valid=True,
                verdict="warn",
                risk_score=35,
                risk_level="medium",
                violations=[],
                safe_response=text,
                explanation="Financial instruction detected without explicit configured policy anchors.",
            )

        return LogicCheckResult(is_valid=True, verdict="allow", safe_response=text)

    def _looks_like_transfer_instruction(self, text: str, amount: float) -> bool:
        del amount
        if not self.TRANSFER_TERMS.search(text):
            return False
        return True

    def _has_policy_anchor(self, text: str) -> bool:
        return bool(self.LIMIT_CONTEXT.search(text) or f"{self.rules.fee_percent:g}%" in text)

    @classmethod
    def _extract_amounts(cls, text: str) -> list[float]:
        amounts: list[float] = []
        for match in cls.MONEY_REGEX.finditer(text):
            raw = match.group(1) or match.group(2)
            try:
                amounts.append(float(str(raw).replace(",", "")))
            except Exception:
                continue
        return amounts

    @classmethod
    def _extract_percentages(cls, text: str) -> list[float]:
        values: list[float] = []
        for match in cls.PERCENT_REGEX.finditer(text):
            try:
                values.append(float(match.group(1)))
            except Exception:
                continue
        return values

    @staticmethod
    def _load_rules() -> FinancialRules:
        policy_path = Path(__file__).resolve().parents[1] / "policies" / "definitions" / "financial_policy.default.json"
        try:
            data = json.loads(policy_path.read_text(encoding="utf-8"))
            business_rules = data.get("business_rules") or {}
            return FinancialRules(
                max_transfer_usd=float(business_rules.get("max_transfer_usd", 10000.0)),
                fee_percent=float(business_rules.get("fee_percent", 2.0)),
            )
        except Exception:
            return FinancialRules()


logic_checker = ResponseLogicChecker()
