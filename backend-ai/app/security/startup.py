from __future__ import annotations

import logging
from typing import Any, Callable

from app.security.detectors.semanticJailbreakDetector import detect_semantic_jailbreak
from app.security.graph.contextSecurityGraph import update_context_graph
from app.security.interceptors.toolCallInterceptor import intercept_tool_call
from app.security.interceptors.twoFactorEnforcer import two_factor_enforcer
from app.security.monitoring.contextMonitor import context_monitor
from app.security.monitoring.riskScoringEngine import calculate_risk_score
from app.security.policies.financialGuardrail import policy_management_service
from app.security.preprocessors.decodeLayer import decode_layer
from app.security.preprocessors.morseDecoder import decode_morse
from app.security.scanners.outputLeakScanner import scan_output_for_leaks
from app.security.scanners.piiScanner import scan_pii
from app.security.scanners.promptScanner import scan_prompt_security
from app.security.telemetry.auditTrail import security_audit_trail
from app.security.telemetry.metrics import security_metrics
from app.security.telemetry.securityLogger import security_logger

logger = logging.getLogger("security.startup")


def _run_check(name: str, operation: Callable[[], Any], failures: dict[str, str]) -> None:
    try:
        operation()
    except Exception as exc:  # pragma: no cover - defensive guard
        failures[name] = str(exc)
        logger.exception("Security module startup check failed: %s", name)


def initialize_security_stack() -> dict[str, Any]:
    failures: dict[str, str] = {}

    checks: list[tuple[str, Callable[[], Any]]] = [
        ("decodeLayer", lambda: decode_layer.process("startup healthcheck")),
        ("morseDecoder", lambda: decode_morse(".... . .-.. .-.. --- / .-- --- .-. .-.. -..")),
        ("promptScanner", lambda: scan_prompt_security("startup healthcheck")),
        ("contextGraphSecurity", lambda: update_context_graph("startup-healthcheck", "prompt_input", {"risk_score": 0.0, "labels": ["startup"]})),
        ("financialGuardrail", lambda: policy_management_service.load_policies(force=True)),
        ("outputLeakScanner", lambda: scan_output_for_leaks("startup healthcheck")),
        ("piiScanner", lambda: scan_pii("startup healthcheck")),
        ("semanticJailbreakDetection", lambda: detect_semantic_jailbreak("startup healthcheck")),
        (
            "toolContextFirewall",
            lambda: intercept_tool_call(
                tool_name=None,
                tool_args=None,
                two_factor_code=None,
                user_id="startup-healthcheck",
                metadata={"origin": "startup"},
                detector_result={"is_flagged": False, "restricted_tool_calls": []},
                mfa_verified=False,
            ),
        ),
        ("mfaEnforcement", lambda: two_factor_enforcer.verify(provided_code=None, user_id="startup-healthcheck")),
        (
            "riskScoringEngine",
            lambda: calculate_risk_score(detector_hits=[], policy_hits=[], tool_risk_score=0, context_risk_score=0),
        ),
        (
            "contextMonitor",
            lambda: context_monitor.evaluate(
                session_id="startup-healthcheck",
                conversation_id=None,
                prompt="startup healthcheck",
                detector_hits=[],
            ),
        ),
        (
            "auditTrail",
            lambda: security_audit_trail.append(
                event_type="security_startup_check",
                session_id="startup-healthcheck",
                severity="INFO",
                data={"module": "auditTrail"},
            ),
        ),
        ("metrics", lambda: security_metrics.increment("security.startup.checks")),
        (
            "securityLogger",
            lambda: security_logger.log_event(
                "security_startup_check",
                {"module": "securityLogger"},
                correlation_id="startup-healthcheck",
                key="security_startup_check",
            ),
        ),
    ]

    for name, check in checks:
        _run_check(name, check, failures)

    modules = [name for name, _ in checks]
    return {
        "ready": not failures,
        "module_count": len(modules),
        "modules": modules,
        "failed_modules": failures,
    }

