from __future__ import annotations

import re
from collections import defaultdict
from threading import RLock
from time import monotonic
from typing import Any

from pydantic import BaseModel, Field


class AnonymizationToken(BaseModel):
    token: str
    type: str


class AnonymizationResult(BaseModel):
    original_contains_pii: bool = False
    anonymized_text: str = ""
    tokens: list[AnonymizationToken] = Field(default_factory=list)
    pii_counts: dict[str, int] = Field(default_factory=dict)


class Anonymizer:
    EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
    IBAN_REGEX = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", re.IGNORECASE)
    CREDIT_CARD_REGEX = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
    PHONE_REGEX = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b")
    ACCOUNT_NUMBER_REGEX = re.compile(
        r"\b(?:(?:account|acct|iban|routing)\s*(?:number|no\.?|#)?\s*[:#-]?\s*)(\d{8,17})\b",
        re.IGNORECASE,
    )

    def __init__(self, ttl_seconds: int = 900) -> None:
        self.ttl_seconds = max(60, int(ttl_seconds or 900))
        self._lock = RLock()
        self._vault: dict[str, dict[str, str]] = {}
        self._token_types: dict[str, dict[str, str]] = {}
        self._created_at: dict[str, float] = {}

    def anonymize(self, text: str, request_id: str | None = None, session_id: str | None = None) -> AnonymizationResult:
        scope = self._scope(request_id=request_id, session_id=session_id)
        value = str(text or "")
        counts: dict[str, int] = defaultdict(int)
        tokens: list[AnonymizationToken] = []

        with self._lock:
            self._expire_locked()
            self._vault.setdefault(scope, {})
            self._token_types.setdefault(scope, {})
            self._created_at[scope] = monotonic()

            def replace_value(match: re.Match[str], pii_type: str, group: int = 0) -> str:
                raw = match.group(group)
                if pii_type == "credit_card" and not self._luhn_valid(raw):
                    return match.group(0)
                counts[pii_type] += 1
                token = f"{{{{USER_{pii_type.upper()}_{counts[pii_type]}}}}}"
                self._vault[scope][token] = raw
                self._token_types[scope][token] = pii_type
                tokens.append(AnonymizationToken(token=token, type=pii_type))
                if group == 0:
                    return token
                return match.group(0).replace(raw, token, 1)

            value = self.EMAIL_REGEX.sub(lambda match: replace_value(match, "email"), value)
            value = self.IBAN_REGEX.sub(lambda match: replace_value(match, "iban"), value)
            value = self.CREDIT_CARD_REGEX.sub(lambda match: replace_value(match, "credit_card"), value)
            value = self.ACCOUNT_NUMBER_REGEX.sub(lambda match: replace_value(match, "bank_account", group=1), value)
            value = self.PHONE_REGEX.sub(lambda match: replace_value(match, "phone"), value)

        return AnonymizationResult(
            original_contains_pii=bool(tokens),
            anonymized_text=value,
            tokens=tokens,
            pii_counts=dict(counts),
        )

    def deanonymize(self, text: str, request_id: str | None = None, session_id: str | None = None) -> str:
        scope = self._scope(request_id=request_id, session_id=session_id)
        output = str(text or "")
        with self._lock:
            mapping = dict(self._vault.get(scope) or {})
        for token, raw_value in mapping.items():
            output = output.replace(token, raw_value)
        return output

    def clear(self, request_id: str | None = None, session_id: str | None = None) -> None:
        scope = self._scope(request_id=request_id, session_id=session_id)
        with self._lock:
            self._vault.pop(scope, None)
            self._token_types.pop(scope, None)
            self._created_at.pop(scope, None)

    def vault_snapshot(self, request_id: str | None = None, session_id: str | None = None) -> dict[str, str]:
        scope = self._scope(request_id=request_id, session_id=session_id)
        with self._lock:
            return dict(self._vault.get(scope) or {})

    def _expire_locked(self) -> None:
        now = monotonic()
        expired = [scope for scope, created in self._created_at.items() if now - created > self.ttl_seconds]
        for scope in expired:
            self._vault.pop(scope, None)
            self._token_types.pop(scope, None)
            self._created_at.pop(scope, None)

    @staticmethod
    def _scope(request_id: str | None = None, session_id: str | None = None) -> str:
        return str(request_id or session_id or "anonymous")

    @staticmethod
    def _luhn_valid(number: str) -> bool:
        digits = [int(ch) for ch in str(number or "") if ch.isdigit()]
        if len(digits) < 13 or len(digits) > 19:
            return False
        checksum = 0
        for idx, digit in enumerate(reversed(digits)):
            if idx % 2:
                doubled = digit * 2
                checksum += doubled if doubled < 10 else doubled - 9
            else:
                checksum += digit
        return checksum % 10 == 0


anonymizer = Anonymizer()
