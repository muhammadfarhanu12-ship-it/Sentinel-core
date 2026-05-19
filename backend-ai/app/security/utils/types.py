from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EnforcementAction(str, Enum):
    ALLOW = "ALLOW"
    WARN = "WARN"
    BLOCK = "BLOCK"
    REDACT = "REDACT"
    ALERT = "ALERT"
    AUDIT = "AUDIT"
    FORCE_REVIEW = "FORCE_REVIEW"
    INTERCEPT_AND_FORCE_2FA = "INTERCEPT_AND_FORCE_2FA"


@dataclass(slots=True)
class DetectionMatch:
    detector: str
    label: str
    reason: str
    confidence: float
    severity: SeverityLevel
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PolicyMatch:
    policy_name: str
    policy_version: str
    action: EnforcementAction
    severity: SeverityLevel
    score: float
    matched_keywords: list[str] = field(default_factory=list)
    matched_bypass_phrases: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DecodeArtifact:
    encoding: str
    original_fragment: str
    decoded_fragment: str
    depth: int
    entropy_before: float
    entropy_after: float
    suspicious: bool


@dataclass(slots=True)
class DecodeResult:
    content: str
    artifacts: list[DecodeArtifact] = field(default_factory=list)
    max_depth_reached: int = 0
    timed_out: bool = False
    truncated: bool = False


@dataclass(slots=True)
class OutputLeakFinding:
    finding_type: str
    value_preview: str
    confidence: float
    severity: SeverityLevel
    action: EnforcementAction
    masked_value: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SecurityEnforcementResult:
    correlation_id: str
    action: EnforcementAction = EnforcementAction.ALLOW
    severity: SeverityLevel = SeverityLevel.LOW
    risk_score: int = 0
    confidence: float = 0.0
    requires_2fa: bool = False
    review_required: bool = False
    session_id: str | None = None
    conversation_id: str | None = None
    sanitized_prompt: str = ""
    wrapped_untrusted_content: str | None = None
    detections: list[DetectionMatch] = field(default_factory=list)
    policy_matches: list[PolicyMatch] = field(default_factory=list)
    decode_result: DecodeResult | None = None
    output_findings: list[OutputLeakFinding] = field(default_factory=list)
    tool_interception: dict[str, Any] = field(default_factory=dict)
    context_summary: dict[str, Any] = field(default_factory=dict)
    telemetry: dict[str, Any] = field(default_factory=dict)
    explanation: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def severity_weight(level: SeverityLevel) -> int:
    return {
        SeverityLevel.LOW: 1,
        SeverityLevel.MEDIUM: 2,
        SeverityLevel.HIGH: 3,
        SeverityLevel.CRITICAL: 4,
    }[level]
