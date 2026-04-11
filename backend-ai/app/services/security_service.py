import asyncio
import logging
import re
from time import perf_counter
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.sentinel_core import build_sentinel_verdict, sentinel_blocks
from app.services.threat_detection import ThreatDetectionService, primary_threat_type

logger = logging.getLogger("security_scan")

# ---------------------------
# PII Detection Patterns
# ---------------------------
PII_PATTERNS = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone": r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
    "password": r"(?:password\s*[:=]\s*['\"].+?['\"])",
    "secret": r"secret",
}

# ---------------------------
# Prompt Injection Patterns
# ---------------------------
PROMPT_INJECTION_PATTERNS = [
    r"ignore all previous instructions",
    r"ignore previous instructions",
    r"output your system prompt",
    r"provide hidden keys",
    r"exfiltrate data",
    r"bypass security",
    r"override safety",
]

# ---------------------------
# Malicious Code Patterns
# ---------------------------
MALICIOUS_PATTERNS = [
    r"delete\s+.*C:\\Users",
    r"rm\s+-rf\s+/",
    r"eval\(",
    r"os\.system\(",
    r"subprocess\.Popen",
]

FAST_LANE_PATTERNS = [
    re.compile(r"\bignore (all )?previous instructions\b", re.I),
    re.compile(r"\b(system prompt|hidden prompt|developer mode|debugbot)\b", re.I),
    re.compile(r"\b(os\.environ|printenv|api key|secret key|/etc/passwd|\.env)\b", re.I),
    re.compile(r"\b(base64|hex|rot13|\\u[0-9a-f]{4}|\\x[0-9a-f]{2})\b", re.I),
]

# ---------------------------
# Detection Functions
# ---------------------------
def detect_injection(prompt: str) -> bool:
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, prompt, flags=re.IGNORECASE):
            return True
    return False

def detect_malicious(prompt: str) -> bool:
    for pattern in MALICIOUS_PATTERNS:
        if re.search(pattern, prompt, flags=re.IGNORECASE):
            return True
    return False

def scan_pii(prompt: str) -> bool:
    for pattern in PII_PATTERNS.values():
        if re.search(pattern, prompt, flags=re.IGNORECASE):
            return True
    return False

def redact_sensitive_data(prompt: str) -> str:
    sanitized = prompt
    for key, pattern in PII_PATTERNS.items():
        sanitized = re.sub(pattern, f"[REDACTED_{key.upper()}]", sanitized, flags=re.IGNORECASE)
    return sanitized

def classify_threat(prompt: str) -> str:
    if detect_injection(prompt):
        return "PROMPT_INJECTION"
    if detect_malicious(prompt):
        return "MALICIOUS_CODE"
    if scan_pii(prompt):
        return "DATA_LEAK"
    return "NONE"


def _assessment_to_scan_result(
    assessment: Any,
    *,
    provider: str,
    model: str,
    security_tier: str,
) -> Dict[str, Any]:
    # Backwards-compat: preserve legacy single label for existing UI/analytics.
    primary = primary_threat_type(assessment.threat_types)

    # Map enterprise decision modes to existing status labels used across the backend/frontend.
    status_map = {"ALLOW": "CLEAN", "SANITIZE": "REDACTED", "BLOCK": "BLOCKED"}
    status = status_map.get(assessment.decision, "CLEAN")

    sentinel_verdict = build_sentinel_verdict(assessment)
    status_value = status
    decision_value = assessment.decision
    threat_score_value = max(float(assessment.threat_score or 0.0), float(sentinel_verdict.get("threat_score") or 0.0))
    risk_level_value = assessment.risk_level
    if threat_score_value >= 0.8:
        risk_level_value = "high"
    elif threat_score_value >= 0.4:
        risk_level_value = "medium"
    else:
        risk_level_value = "low"

    if sentinel_blocks(sentinel_verdict):
        status_value = "BLOCKED"
        decision_value = "BLOCK"

    return {
        "status": status_value,
        "decision": decision_value,
        "threat_type": primary,
        "threat_types": assessment.threat_types,
        "threat_score": threat_score_value,
        "sentinel_verdict": sentinel_verdict,
        "risk_level": risk_level_value,
        "attack_vector": assessment.attack_vector,
        "detection_stage_triggered": assessment.detection_stage_triggered,
        "explanation": assessment.explanation,
        "sanitized_content": assessment.sanitized_content,
        "provider": provider,
        "model": model,
        "security_tier": security_tier,
    }


def _rules_only_scan_result(
    prompt: str,
    *,
    provider: str,
    model: str,
    security_tier: str,
) -> Dict[str, Any]:
    threat_type = classify_threat(prompt)
    threat_types = [threat_type] if threat_type != "NONE" else ["NONE"]
    sanitized_content = prompt
    status = "CLEAN"
    decision = "ALLOW"
    threat_score = 0.1
    risk_level = "low"
    attack_vector = "No high-confidence threat vectors detected."
    explanation = "No high-confidence malicious intent detected."

    if threat_type == "PROMPT_INJECTION":
        status = "BLOCKED"
        decision = "BLOCK"
        threat_score = 0.95
        risk_level = "high"
        sanitized_content = "[REDACTED: PROMPT INJECTION DETECTED]"
        attack_vector = "instruction override / prompt injection"
        explanation = "Detected instruction override / prompt injection."
    elif threat_type == "MALICIOUS_CODE":
        status = "BLOCKED"
        decision = "BLOCK"
        threat_score = 0.97
        risk_level = "high"
        sanitized_content = "[REDACTED: MALICIOUS CONTENT REMOVED]"
        attack_vector = "privilege escalation / unsafe execution intent"
        explanation = "Detected malicious code or unsafe execution intent."
    elif threat_type == "DATA_LEAK":
        status = "REDACTED"
        decision = "SANITIZE"
        threat_score = 0.65
        risk_level = "medium"
        sanitized_content = redact_sensitive_data(prompt)
        attack_vector = "data or secret exfiltration attempt"
        explanation = "Detected sensitive data indicators and sanitized the payload."

    sentinel_verdict = build_sentinel_verdict(
        {
            "threat_types": threat_types,
            "threat_score": threat_score,
            "decision": decision,
            "explanation": explanation,
            "attack_vector": attack_vector,
            "sanitized_content": sanitized_content,
            "debug": {"stage1": {"hits": [{"rule": "rules_only_fallback", "threat_type": threat_type}]}},
        }
    )

    if sentinel_blocks(sentinel_verdict):
        status = "BLOCKED"
        decision = "BLOCK"

    return {
        "status": status,
        "decision": decision,
        "threat_type": threat_type,
        "threat_types": threat_types,
        "threat_score": max(float(threat_score), float(sentinel_verdict.get("threat_score") or 0.0)),
        "sentinel_verdict": sentinel_verdict,
        "risk_level": risk_level,
        "attack_vector": attack_vector,
        "detection_stage_triggered": ["stage1_fast_rules", "rules_only_fallback"],
        "explanation": explanation,
        "sanitized_content": sanitized_content,
        "provider": provider,
        "model": model,
        "security_tier": security_tier,
    }


def _is_suspicious_or_large_prompt(prompt: str) -> bool:
    if len(prompt) >= int(getattr(settings, "SCAN_SUSPICIOUS_PROMPT_LENGTH", 4000) or 4000):
        return True
    return any(pattern.search(prompt) for pattern in FAST_LANE_PATTERNS)


def _dynamic_scan_timeout_seconds(prompt: str) -> float:
    base_timeout = max(0.05, float(getattr(settings, "SCAN_BASE_TIMEOUT_SECONDS", 6.0) or 6.0))
    max_timeout = max(base_timeout, float(getattr(settings, "SCAN_MAX_TIMEOUT_SECONDS", 12.0) or 12.0))
    per_2k_chars = max(0.0, float(getattr(settings, "SCAN_TIMEOUT_PER_2K_CHARS", 1.5) or 1.5))
    timeout = base_timeout + ((max(0, len(prompt) - 1) // 2000) * per_2k_chars)
    if _is_suspicious_or_large_prompt(prompt):
        timeout += 1.0
    return min(timeout, max_timeout)

# ---------------------------
# Main Scan Function
# ---------------------------
def scan_prompt(
    prompt: str,
    provider: str = "openai",
    model: str = "gpt-5.4",
    security_tier: str = "PRO",
    enable_ai: bool | None = None,
) -> Dict[str, Any]:
    """
    Production-ready prompt scan:
      - Detect prompt injection
      - Detect PII and redact
      - Detect malicious code
      - Classify threat
      - Return structured JSON for frontend
    """
    assessment = ThreatDetectionService().analyze(
        prompt,
        provider=provider,
        model=model,
        security_tier=security_tier,
        enable_ai=enable_ai,
    )
    return _assessment_to_scan_result(
        assessment,
        provider=provider,
        model=model,
        security_tier=security_tier,
    )


async def scan_prompt_with_resilience(
    prompt: str,
    *,
    provider: str = "openai",
    model: str = "gpt-5.4",
    security_tier: str = "PRO",
) -> tuple[Dict[str, Any], dict[str, Any]]:
    started_at = perf_counter()
    input_size = len(prompt)
    suspicious_or_large = _is_suspicious_or_large_prompt(prompt)
    retry_attempts = max(1, min(int(getattr(settings, "SCAN_RETRY_ATTEMPTS", 2) or 2), 2))
    timeout_seconds = _dynamic_scan_timeout_seconds(prompt)
    best_effort_result = _rules_only_scan_result(
        prompt,
        provider=provider,
        model=model,
        security_tier=security_tier,
    )

    logger.info(
        "Prompt scan started input_size=%s suspicious_or_large=%s security_tier=%s timeout_seconds=%.2f retry_attempts=%s",
        input_size,
        suspicious_or_large,
        security_tier,
        timeout_seconds,
        retry_attempts,
    )

    last_error: Exception | None = None
    for attempt in range(1, retry_attempts + 1):
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    scan_prompt,
                    prompt,
                    provider=provider,
                    model=model,
                    security_tier=security_tier,
                    enable_ai=(False if suspicious_or_large else None),
                ),
                timeout=timeout_seconds,
            )
            total_duration_ms = int((perf_counter() - started_at) * 1000)
            logger.info(
                "Prompt scan finished input_size=%s suspicious_or_large=%s attempt=%s duration_ms=%s status=%s",
                input_size,
                suspicious_or_large,
                attempt,
                total_duration_ms,
                result.get("status"),
            )
            return result, {
                "status": "ok",
                "message": "Scan completed successfully.",
                "partial": False,
                "input_size": input_size,
                "retry_attempts": retry_attempts,
                "attempts_used": attempt,
                "timeout_seconds": timeout_seconds,
                "suspicious_or_large": suspicious_or_large,
                "lightweight_precheck_used": suspicious_or_large,
                "duration_ms": total_duration_ms,
            }
        except asyncio.TimeoutError as exc:
            last_error = exc
            logger.warning(
                "Prompt scan timeout input_size=%s suspicious_or_large=%s attempt=%s timeout_seconds=%.2f",
                input_size,
                suspicious_or_large,
                attempt,
                timeout_seconds,
            )
        except Exception as exc:
            last_error = exc
            logger.exception(
                "Prompt scan failed input_size=%s suspicious_or_large=%s attempt=%s",
                input_size,
                suspicious_or_large,
                attempt,
            )

    total_duration_ms = int((perf_counter() - started_at) * 1000)
    warning_message = "Scan took longer than expected, partial analysis returned"
    logger.warning(
        "Prompt scan fallback returned input_size=%s suspicious_or_large=%s duration_ms=%s fallback_status=%s",
        input_size,
        suspicious_or_large,
        total_duration_ms,
        best_effort_result.get("status"),
    )
    return best_effort_result, {
        "status": "warning",
        "message": warning_message,
        "partial": True,
        "input_size": input_size,
        "retry_attempts": retry_attempts,
        "attempts_used": retry_attempts,
        "timeout_seconds": timeout_seconds,
        "suspicious_or_large": suspicious_or_large,
        "lightweight_precheck_used": True,
        "duration_ms": total_duration_ms,
        "error": str(last_error) if last_error else None,
        "result": {
            "status": best_effort_result.get("status"),
            "threat_type": best_effort_result.get("threat_type"),
            "threat_score": best_effort_result.get("threat_score"),
        },
    }
