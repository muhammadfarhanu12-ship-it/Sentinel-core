from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, Mapping, Optional
from uuid import uuid4

from fastapi import HTTPException

try:
    from app.security.detectors.prompt_injection_detector import detect_prompt_injection
except Exception:
    def detect_prompt_injection(prompt: str, decoded_prompt: Optional[str] = None) -> Dict[str, Any]:
        _ = decoded_prompt
        return {
            "is_flagged": False,
            "is_high_risk": False,
            "should_block": False,
            "risk_level": "LOW",
            "threat_score": 0.0,
            "restricted_tool_calls": [],
            "matched_findings": [],
        }

try:
    from app.security.interceptors.toolCallInterceptor import (
        enforce_mfa_for_flagged_tool,
        intercept_tool_call,
    )
except Exception:
    def enforce_mfa_for_flagged_tool(
        detector_result: Dict[str, Any],
        mfa_verified: bool,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        _ = detector_result
        _ = user_id
        return {
            "enforced": True,
            "mfa_verified": bool(mfa_verified),
            "restricted_tools": [],
        }

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
        _ = tool_args
        _ = two_factor_code
        _ = user_id
        _ = metadata
        _ = detector_result
        _ = mfa_verified

        if not tool_name:
            return {
                "tool_present": False,
                "intercepted": False,
                "requires_2fa": False,
                "approved": True,
                "risk_level": "LOW",
                "risk_score": 0,
            }

        return {
            "tool_present": True,
            "tool_name": str(tool_name),
            "intercepted": False,
            "requires_2fa": False,
            "approved": True,
            "risk_level": "LOW",
            "risk_score": 0,
        }

try:
    from app.security.preprocessors.decodeLayer import decode_layer
except Exception:
    class _DecodeFallbackResult:
        def __init__(self, content: str) -> None:
            self.content = content
            self.artifacts = []
            self.timed_out = False
            self.truncated = False

    class _DecodeLayerStub:
        def process(self, content: str) -> _DecodeFallbackResult:
            return _DecodeFallbackResult(str(content or ""))

    decode_layer = _DecodeLayerStub()

try:
    from app.security.detectors.context_analyzer import context_analyzer
    from app.security.preprocessors.anonymizer import anonymizer
    from app.security.scanners.logic_checker import logic_checker
    from app.security.scanners.promptScanner import scan_prompt as _rich_scan_prompt
except Exception:
    context_analyzer = None
    anonymizer = None
    logic_checker = None
    _rich_scan_prompt = None

try:
    from app.security.scanners.piiScanner import redact_sensitive_output
except Exception:
    def redact_sensitive_output(output_text: str) -> Dict[str, Any]:
        text = str(output_text or "")
        return {
            "redacted_output": text,
            "redaction_events": [],
            "redaction_count": 0,
            "contains_sensitive_data": False,
        }

try:
    from app.security.detectors.intent_classifier import analyze_intent as _analyze_intent_impl
except Exception:
    _analyze_intent_impl = None

try:
    from app.security.interceptors.tool_context_firewall import (
        evaluate_tool_context as _evaluate_tool_context_impl,
    )
except Exception:
    _evaluate_tool_context_impl = None

try:
    from app.security.detectors.narrativeInjectionDetector import (
        detect_narrative_injection as _detect_narrative_injection_impl,
    )
except Exception:
    _detect_narrative_injection_impl = None

try:
    from app.security.graph.contextSecurityGraph import update_context_graph as _update_context_graph_impl
except Exception:
    _update_context_graph_impl = None

try:
    from app.security.telemetry.auditTrail import security_audit_trail
except Exception:
    class _NoopAuditTrail:
        def append(self, **kwargs: Any) -> Dict[str, Any]:
            return {"noop": True, **kwargs}

    security_audit_trail = _NoopAuditTrail()

try:
    from app.security.telemetry.securityLogger import security_logger
except Exception:
    class _NoopSecurityLogger:
        def log_event(
            self,
            event_type: str,
            payload: Dict[str, Any],
            *,
            correlation_id: str,
            key: str | None = None,
        ) -> None:
            _ = event_type
            _ = payload
            _ = correlation_id
            _ = key
            return None

    security_logger = _NoopSecurityLogger()


# =========================================================
# COMPATIBILITY HELPERS
# =========================================================

FINANCIAL_CONTEXT_TERMS = {
    "money",
    "funds",
    "token",
    "tokens",
    "wallet",
    "bank",
    "banking",
    "transfer",
    "wire",
    "payment",
    "usd",
    "crypto",
}

TOOL_CONTEXT_TERMS = {
    "tool",
    "tools",
    "api",
    "function",
    "command",
    "execute",
    "executed",
    "invoked",
    "run",
    "automation",
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_mapping(value: Any) -> Dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)

    if is_dataclass(value):
        return asdict(value)

    if hasattr(value, "__dict__"):
        return {key: val for key, val in vars(value).items() if not key.startswith("_")}

    return {}


def _normalize_text_block(text: str) -> str:
    import re

    value = str(text or "").lower()
    return re.sub(r"\s+", " ", value).strip()


def _contains_any_token(text: str, tokens: set[str]) -> bool:
    lowered = _normalize_text_block(text)
    return any(token in lowered for token in tokens)


def _serialize_detection_match(match: Any) -> Dict[str, Any]:
    data = _coerce_mapping(match)

    if not data:
        data = {
            "detector": getattr(match, "detector", "narrative_injection"),
            "label": getattr(match, "label", "narrative_prompt_injection"),
            "reason": getattr(match, "reason", "Narrative injection signal detected."),
            "confidence": _safe_float(getattr(match, "confidence", 0.0), 0.0),
            "severity": getattr(match, "severity", "MEDIUM"),
            "metadata": getattr(match, "metadata", {}) or {},
        }

    severity_value = data.get("severity")
    if hasattr(severity_value, "value"):
        data["severity"] = str(severity_value.value)
    else:
        data["severity"] = str(severity_value or "MEDIUM")

    data["confidence"] = round(_safe_float(data.get("confidence", 0.0), 0.0), 4)
    data.setdefault("metadata", {})
    data.setdefault("label", "narrative_prompt_injection")
    data.setdefault("detector", "narrative_injection")
    data.setdefault("reason", "Narrative injection signal detected.")
    return data


def analyze_intent(prompt: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Compatibility wrapper.

    Preferred signature:
        analyze_intent(prompt, user_id)

    Safe fallback if classifier module is missing/broken:
        {"risk_score": 0}
    """
    if _analyze_intent_impl is None:
        return {"risk_score": 0}

    try:
        try:
            raw_result = _analyze_intent_impl(prompt=prompt, user_id=user_id)
        except TypeError:
            try:
                raw_result = _analyze_intent_impl(prompt=prompt)
            except TypeError:
                try:
                    raw_result = _analyze_intent_impl(text=prompt, user_id=user_id)
                except TypeError:
                    try:
                        raw_result = _analyze_intent_impl(text=prompt)
                    except TypeError:
                        try:
                            raw_result = _analyze_intent_impl(prompt, user_id)
                        except TypeError:
                            raw_result = _analyze_intent_impl(prompt)
    except Exception:
        return {"risk_score": 0}

    intent_result = _coerce_mapping(raw_result)
    if not intent_result:
        return {"risk_score": 0}

    if "risk_score" not in intent_result:
        confidence = _safe_float(intent_result.get("confidence", 0.0), default=0.0)
        intent_result["risk_score"] = round(min(max(confidence, 0.0), 1.0), 4)

    return intent_result


def evaluate_tool_context(
    tool_name: Optional[str],
    tool_args: Optional[Dict[str, Any]],
    intent: Dict[str, Any],
    detector_result: Dict[str, Any],
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compatibility wrapper.

    Preferred signature:
        evaluate_tool_context(tool_name, tool_args, intent, detector_result, user_id)

    Safe fallback if firewall module is missing/broken:
        {"blocked": False}
    """
    if _evaluate_tool_context_impl is None:
        return {"blocked": False}

    normalized_tool_name = str(tool_name or "")
    normalized_tool_args = tool_args or {}
    normalized_intent = dict(intent or {})
    normalized_detector_result = dict(detector_result or {})

    prompt_for_legacy = str(normalized_intent.get("prompt", ""))
    intent_score = _safe_float(
        normalized_intent.get("risk_score", normalized_intent.get("confidence", 0.0)),
        default=0.0,
    )
    detector_flagged = bool(
        normalized_detector_result.get("is_flagged")
        or normalized_detector_result.get("is_high_risk")
    )

    try:
        try:
            raw_result = _evaluate_tool_context_impl(
                tool_name=normalized_tool_name,
                tool_args=normalized_tool_args,
                intent=normalized_intent,
                detector_result=normalized_detector_result,
                user_id=user_id,
            )
        except TypeError:
            try:
                raw_result = _evaluate_tool_context_impl(
                    tool_name=normalized_tool_name,
                    prompt=prompt_for_legacy,
                    detector_flagged=detector_flagged,
                    intent_score=intent_score,
                )
            except TypeError:
                raw_result = _evaluate_tool_context_impl(
                    normalized_tool_name,
                    normalized_tool_args,
                    normalized_intent,
                    normalized_detector_result,
                    user_id,
                )
    except Exception:
        return {"blocked": False}

    context_result = _coerce_mapping(raw_result)
    if not context_result:
        return {"blocked": False}

    if "blocked" not in context_result:
        if "allowed" in context_result:
            context_result["blocked"] = not bool(context_result.get("allowed"))
        else:
            context_result["blocked"] = False

    context_result.setdefault("allowed", not bool(context_result.get("blocked")))
    return context_result


def detect_narrative_injection(prompt: str, decoded_prompt: Optional[str] = None) -> list[Dict[str, Any]]:
    if _detect_narrative_injection_impl is None:
        return []

    try:
        try:
            raw_findings = _detect_narrative_injection_impl(prompt=prompt, decoded_prompt=decoded_prompt)
        except TypeError:
            try:
                raw_findings = _detect_narrative_injection_impl(prompt, decoded_prompt)
            except TypeError:
                raw_findings = _detect_narrative_injection_impl(prompt)
    except Exception:
        return []

    serialized: list[Dict[str, Any]] = []
    for finding in raw_findings or []:
        data = _serialize_detection_match(finding)
        if data.get("label") == "narrative_prompt_injection":
            serialized.append(data)

    return serialized


def update_context_graph(
    session_id: str,
    event_type: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compatibility wrapper for the graph engine.
    """
    if _update_context_graph_impl is None:
        return {
            "session_id": str(session_id or "anonymous"),
            "event_type": str(event_type or ""),
            "cumulative_risk": 0.0,
            "attack_chain_score": 0.0,
            "attack_flags": {},
            "detected_patterns": [],
            "highest_risk_path": [],
            "highest_risk_edge": {},
            "override_recommendation": None,
            "override_reason": None,
        }

    payload = dict(data or {})

    try:
        graph_state = _update_context_graph_impl(
            session_id=str(session_id or "anonymous"),
            event_type=str(event_type or "risk_event"),
            data=payload,
        )
    except Exception as exc:
        return {
            "session_id": str(session_id or "anonymous"),
            "event_type": str(event_type or ""),
            "error": str(exc),
            "cumulative_risk": 0.0,
            "attack_chain_score": 0.0,
            "attack_flags": {},
            "detected_patterns": [],
            "highest_risk_path": [],
            "highest_risk_edge": {},
            "override_recommendation": None,
            "override_reason": None,
        }

    if hasattr(graph_state, "to_dict"):
        try:
            return graph_state.to_dict()
        except Exception:
            pass

    return _coerce_mapping(graph_state)


# =========================================================
# CORE ORCHESTRATOR
# =========================================================

class SentinelCoreSecurityGateway:
    """
    Enterprise-grade security fusion engine.

    Pipeline:
    Decode -> Detect -> Intent -> Context Firewall -> MFA/Intercept -> Output Scan -> Risk Fusion -> Decision
    """

    def process_request(
        self,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
        llm_callable: Any = None,
    ) -> Dict[str, Any]:
        """
        Protected request orchestration for the AI gateway path.

        Security-sensitive: PII is anonymized before any downstream LLM call,
        and real values are only rehydrated after response logic verification.
        """
        context_dict: Dict[str, Any] = dict(context or {})
        request_id = str(context_dict.get("request_id") or uuid4())
        session_id = str(context_dict.get("session_id") or context_dict.get("conversation_id") or request_id)
        prompt_text = str(prompt or "")
        anonymization_payload: Dict[str, Any] = {
            "original_contains_pii": False,
            "pii_counts": {},
        }

        try:
            decoded_result = decode_layer.process(prompt_text)
            decoded_text = str(getattr(decoded_result, "content", prompt_text) or prompt_text)

            if anonymizer is not None:
                anonymization = anonymizer.anonymize(decoded_text, request_id=request_id, session_id=session_id)
                protected_prompt = anonymization.anonymized_text
                anonymization_payload = {
                    "original_contains_pii": anonymization.original_contains_pii,
                    "pii_counts": dict(anonymization.pii_counts or {}),
                    "token_count": len(anonymization.tokens),
                }
            else:
                protected_prompt = decoded_text

            if context_analyzer is not None:
                context_result_obj = context_analyzer.analyze(
                    session_id=session_id,
                    current_prompt=protected_prompt,
                    context=context_dict,
                )
                context_result = context_result_obj.model_dump()
            else:
                context_result = {"verdict": "allow", "risk_score": 0, "risk_level": "low"}

            if str(context_result.get("verdict") or "").lower() == "block":
                return {
                    "request_id": request_id,
                    "session_id": session_id,
                    "verdict": "block",
                    "risk_score": int(context_result.get("risk_score") or 85),
                    "risk_level": str(context_result.get("risk_level") or "critical"),
                    "context_analysis": context_result,
                    "anonymization": anonymization_payload,
                    "prompt_scan": {},
                    "logic_check": {},
                    "response": "Request blocked: stateful payload splitting was detected.",
                }

            prompt_scan = (
                _rich_scan_prompt(protected_prompt, context=context_dict)
                if _rich_scan_prompt is not None
                else {"verdict": "allow", "risk_score": 0, "risk_level": "low"}
            )
            if str(prompt_scan.get("verdict") or "").lower() == "block":
                return {
                    "request_id": request_id,
                    "session_id": session_id,
                    "verdict": "block",
                    "risk_score": int(prompt_scan.get("risk_score") or 75),
                    "risk_level": str(prompt_scan.get("risk_level") or "high"),
                    "context_analysis": context_result,
                    "anonymization": anonymization_payload,
                    "prompt_scan": prompt_scan,
                    "logic_check": {},
                    "response": "Request blocked: prompt security policy violation.",
                }

            llm_response = self._call_downstream_llm(protected_prompt, llm_callable=llm_callable)
            if logic_checker is not None:
                logic_result_obj = logic_checker.verify_response(llm_response, context=context_dict)
                logic_result = logic_result_obj.model_dump()
            else:
                logic_result = {"verdict": "allow", "safe_response": llm_response, "violations": []}

            if str(logic_result.get("verdict") or "").lower() == "block":
                return {
                    "request_id": request_id,
                    "session_id": session_id,
                    "verdict": "block",
                    "risk_score": int(logic_result.get("risk_score") or 90),
                    "risk_level": str(logic_result.get("risk_level") or "critical"),
                    "context_analysis": context_result,
                    "anonymization": anonymization_payload,
                    "prompt_scan": prompt_scan,
                    "logic_check": logic_result,
                    "response": str(logic_result.get("safe_response") or "Policy violation."),
                }

            safe_response = str(logic_result.get("safe_response") or llm_response)
            final_response = (
                anonymizer.deanonymize(safe_response, request_id=request_id, session_id=session_id)
                if anonymizer is not None
                else safe_response
            )
            return {
                "request_id": request_id,
                "session_id": session_id,
                "verdict": str(logic_result.get("verdict") or prompt_scan.get("verdict") or "allow"),
                "risk_score": max(int(prompt_scan.get("risk_score") or 0), int(logic_result.get("risk_score") or 0)),
                "risk_level": str(logic_result.get("risk_level") or prompt_scan.get("risk_level") or "low"),
                "context_analysis": context_result,
                "anonymization": anonymization_payload,
                "prompt_scan": prompt_scan,
                "logic_check": logic_result,
                "response": final_response,
            }
        finally:
            if anonymizer is not None:
                anonymizer.clear(request_id=request_id, session_id=session_id)

    @staticmethod
    def _call_downstream_llm(protected_prompt: str, llm_callable: Any = None) -> str:
        if llm_callable is not None:
            return str(llm_callable(protected_prompt) or "")
        try:
            from app.ai_service import get_clean_execution_output

            return str(get_clean_execution_output(protected_prompt) or "")
        except Exception:
            return ""

    # -----------------------------------------------------
    # RISK FUSION ENGINE
    # -----------------------------------------------------

    def _compute_final_risk(
        self,
        detector_result: Dict[str, Any],
        interceptor_result: Dict[str, Any],
        decode_meta: Dict[str, Any],
        output_scan_result: Dict[str, Any],
    ) -> Dict[str, Any]:

        score = 0.0
        reasons = []

        # ---------------------------------------------
        # Detector contribution
        # ---------------------------------------------
        detector_score = float(detector_result.get("threat_score", 0))
        score += detector_score * 0.5

        if detector_result.get("is_high_risk"):
            score += 0.2
            reasons.append("High-risk prompt injection detected")

        # ---------------------------------------------
        # Narrative injection contribution
        # ---------------------------------------------
        narrative_confidence = _safe_float(detector_result.get("narrative_confidence", 0.0), 0.0)
        if detector_result.get("has_narrative_injection"):
            score += min(0.45, 0.15 + (narrative_confidence * 0.35))
            reasons.append("Narrative prompt injection signals detected")

            has_financial = bool(detector_result.get("narrative_financial_context"))
            has_tool = bool(detector_result.get("narrative_tool_context") or interceptor_result.get("tool_present"))
            has_decoded_payload = bool(
                detector_result.get("narrative_decoded_payload") or decode_meta.get("artifact_count", 0) > 0
            )

            if narrative_confidence >= 0.80 and has_financial and has_tool and has_decoded_payload:
                score = max(score, 0.90)
                reasons.append("Narrative injection + financial/tool/decoded payload overlap")

        # ---------------------------------------------
        # Interceptor contribution
        # ---------------------------------------------
        if interceptor_result.get("intercepted"):
            score += 0.4
            reasons.append("Tool execution intercepted")

        # ---------------------------------------------
        # Decode anomalies
        # ---------------------------------------------
        if decode_meta.get("artifact_count", 0) > 0:
            score += 0.1
            reasons.append("Encoded payload detected")

        if decode_meta.get("timed_out"):
            score += 0.15
            reasons.append("Decoding anomaly detected")

        # ---------------------------------------------
        # Output leakage
        # ---------------------------------------------
        if output_scan_result.get("contains_sensitive_data"):
            score += 0.25
            reasons.append("Sensitive data leak detected")

        # Clamp
        score = min(score, 1.0)

        # Classification
        if score >= 0.85:
            level = "CRITICAL"
        elif score >= 0.65:
            level = "HIGH"
        elif score >= 0.40:
            level = "MEDIUM"
        else:
            level = "LOW"

        return {
            "final_score": round(score, 4),
            "risk_level": level,
            "reasons": reasons,
        }

    # -----------------------------------------------------
    # PIPELINE
    # -----------------------------------------------------

    def run_pipeline(
        self,
        prompt: str,
        ai_output_text: str,
        mfa_verified: bool = False,
        user_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        tool_args: Optional[Dict[str, Any]] = None,
        two_factor_code: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:

        prompt_text: str = str(prompt or "")
        output_text: str = str(ai_output_text or "")
        metadata_dict: Dict[str, Any] = dict(metadata or {})
        session_id = str(
            metadata_dict.get("session_id")
            or metadata_dict.get("conversation_id")
            or user_id
            or "anonymous"
        )
        decoded_prompt: str = prompt_text

        decode_meta: Dict[str, Any] = {}
        detector_result: Dict[str, Any] = {}
        intent_result: Dict[str, Any] = {"risk_score": 0}
        context_result: Dict[str, Any] = {"blocked": False}
        interceptor_result: Dict[str, Any] = {
            "tool_present": bool(tool_name),
            "intercepted": False,
            "requires_2fa": False,
            "approved": True,
            "risk_level": "LOW",
            "risk_score": 0,
        }
        output_scan_result: Dict[str, Any] = {}

        narrative_findings: list[Dict[str, Any]] = []
        narrative_detected = False
        narrative_confidence = 0.0
        narrative_financial_context = False
        narrative_tool_context = False
        hitl_bypass_detected = False
        authority_impersonation_detected = False
        graph_context: Dict[str, Any] = update_context_graph(
            session_id=session_id,
            event_type="prompt_input",
            data={
                "risk_score": 0.05,
                "confidence": 0.20,
                "labels": ["prompt_input"],
                "prompt_length": len(prompt_text),
                "user_id": user_id,
            },
        )

        # =================================================
        # 1. DECODE LAYER
        # =================================================
        try:
            decode_result = decode_layer.process(prompt_text)
            decoded_prompt = decode_result.content

            decode_meta = {
                "artifact_count": len(decode_result.artifacts),
                "timed_out": decode_result.timed_out,
                "truncated": decode_result.truncated,
            }

        except Exception as exc:
            decode_meta = {
                "artifact_count": 0,
                "timed_out": False,
                "truncated": False,
                "error": str(exc),
            }

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="decode_layer",
            data={
                "risk_score": 0.10 if int(decode_meta.get("artifact_count", 0) or 0) > 0 else 0.03,
                "confidence": 0.75 if int(decode_meta.get("artifact_count", 0) or 0) > 0 else 0.35,
                "labels": ["decoded_prompt"],
                "decoded_prompt": decoded_prompt,
                "artifact_count": int(decode_meta.get("artifact_count", 0) or 0),
                "timed_out": bool(decode_meta.get("timed_out")),
                "truncated": bool(decode_meta.get("truncated")),
                "error": decode_meta.get("error"),
            },
        )

        # =================================================
        # 2. PROMPT INJECTION DETECTOR (+ NARRATIVE)
        # =================================================
        try:
            detector_result = detect_prompt_injection(
                prompt=prompt_text,
                decoded_prompt=decoded_prompt,
            )
        except Exception as exc:
            detector_result = {
                "is_flagged": True,
                "is_high_risk": True,
                "should_block": True,
                "risk_level": "CRITICAL",
                "threat_score": 1.0,
                "restricted_tool_calls": [],
                "matched_findings": [],
                "reasons": [f"Detector failure: {exc}"],
            }

        detector_attack_categories = {
            str(category)
            for category in (detector_result.get("attack_categories") or [])
        }
        hitl_bypass_detected = "HITL_BYPASS_ATTEMPT" in detector_attack_categories
        authority_impersonation_detected = (
            "authority_impersonation" in detector_attack_categories
            or "AUTHORITY_IMPERSONATION" in detector_attack_categories
        )
        if hitl_bypass_detected:
            detector_result["is_flagged"] = True
            detector_result["is_high_risk"] = True
            detector_result["should_block"] = True
            detector_result["risk_level"] = "CRITICAL"
            detector_result["severity"] = "CRITICAL"
            detector_result["threat_score"] = max(
                _safe_float(detector_result.get("threat_score", 0.0), 0.0),
                0.95,
            )
            matched_findings = list(detector_result.get("matched_findings") or [])
            matched_findings.append("HITL_BYPASS_ATTEMPT:authority_impersonation_financial_chain")
            if authority_impersonation_detected:
                matched_findings.append("AUTHORITY_IMPERSONATION:operational_narrative")
            detector_result["matched_findings"] = sorted(set(matched_findings))

            security_audit_trail.append(
                event_type="sentinel_core_hitl_bypass_detected",
                session_id=session_id,
                user_id=user_id,
                severity="CRITICAL",
                data={
                    "tool_name": tool_name,
                    "attack_categories": sorted(detector_attack_categories),
                    "matched_findings": detector_result.get("matched_findings"),
                    "decoded_payload_present": bool(decode_meta.get("artifact_count", 0) > 0),
                },
            )

        try:
            narrative_findings = detect_narrative_injection(
                prompt=prompt_text,
                decoded_prompt=decoded_prompt,
            )
        except Exception:
            narrative_findings = []

        if narrative_findings:
            narrative_detected = True
            narrative_confidence = max((_safe_float(hit.get("confidence", 0.0), 0.0) for hit in narrative_findings), default=0.0)
            narrative_financial_context = any(
                bool((hit.get("metadata") or {}).get("financial_context")) for hit in narrative_findings
            ) or _contains_any_token(decoded_prompt, FINANCIAL_CONTEXT_TERMS)
            narrative_tool_context = any(
                bool((hit.get("metadata") or {}).get("tool_context")) for hit in narrative_findings
            ) or bool(tool_name) or _contains_any_token(decoded_prompt, TOOL_CONTEXT_TERMS)
            has_decoded_payload = bool(decode_meta.get("artifact_count", 0) > 0)

            matched_findings = list(detector_result.get("matched_findings") or [])
            matched_findings.append("narrative_prompt_injection")

            detector_result["matched_findings"] = sorted(set(matched_findings))
            detector_result["narrative_findings"] = narrative_findings
            detector_result["has_narrative_injection"] = True
            detector_result["narrative_confidence"] = round(narrative_confidence, 4)
            detector_result["narrative_financial_context"] = narrative_financial_context
            detector_result["narrative_tool_context"] = narrative_tool_context
            detector_result["narrative_decoded_payload"] = has_decoded_payload

            detector_result["is_flagged"] = True
            detector_result["threat_score"] = max(
                _safe_float(detector_result.get("threat_score", 0.0), 0.0),
                max(0.35, narrative_confidence),
            )

            if narrative_confidence >= 0.80:
                detector_result["is_high_risk"] = True

            current_risk_level = str(detector_result.get("risk_level", "LOW")).upper()
            if narrative_confidence >= 0.90:
                detector_result["risk_level"] = "CRITICAL"
                detector_result["should_block"] = True
            elif narrative_confidence >= 0.80 and current_risk_level not in {"CRITICAL"}:
                detector_result["risk_level"] = "HIGH"
            elif narrative_confidence >= 0.60 and current_risk_level not in {"CRITICAL", "HIGH"}:
                detector_result["risk_level"] = "MEDIUM"

            security_audit_trail.append(
                event_type="sentinel_core_narrative_injection_detected",
                session_id=session_id,
                user_id=user_id,
                severity="CRITICAL" if narrative_confidence >= 0.90 else "HIGH",
                data={
                    "confidence": round(narrative_confidence, 4),
                    "tool_name": tool_name,
                    "financial_context": narrative_financial_context,
                    "tool_context": narrative_tool_context,
                    "decoded_payload_present": bool(decode_meta.get("artifact_count", 0) > 0),
                },
            )

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="detector_result",
            data={
                "risk_score": _safe_float(detector_result.get("threat_score", 0.0), 0.0),
                "confidence": _safe_float(detector_result.get("threat_score", 0.0), 0.0),
                "labels": list(detector_result.get("matched_findings") or []),
                "matched_findings": list(detector_result.get("matched_findings") or []),
                "is_flagged": bool(detector_result.get("is_flagged")),
                "is_high_risk": bool(detector_result.get("is_high_risk")),
                "risk_level": detector_result.get("risk_level"),
                "has_narrative_injection": bool(detector_result.get("has_narrative_injection")),
                "narrative_findings": list(detector_result.get("narrative_findings") or []),
                "narrative_confidence": _safe_float(detector_result.get("narrative_confidence", 0.0), 0.0),
                "narrative_financial_context": bool(detector_result.get("narrative_financial_context")),
                "narrative_tool_context": bool(detector_result.get("narrative_tool_context")),
                "restricted_tool_calls": list(detector_result.get("restricted_tool_calls") or []),
                "attack_categories": list(detector_result.get("attack_categories") or []),
                "hitl_bypass_attempt": bool(hitl_bypass_detected),
                "authority_impersonation_detected": bool(authority_impersonation_detected),
            },
        )

        # =================================================
        # 3. INTENT CLASSIFICATION
        # =================================================
        try:
            intent_result = analyze_intent(
                prompt=decoded_prompt,
                user_id=user_id,
            )
        except Exception as exc:
            intent_result = {
                "risk_score": 0,
                "error": str(exc),
            }

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="intent_classification",
            data={
                "risk_score": _safe_float(intent_result.get("risk_score", intent_result.get("confidence", 0.0)), 0.0),
                "confidence": _safe_float(intent_result.get("confidence", intent_result.get("risk_score", 0.0)), 0.0),
                "labels": [
                    "detected_intent",
                    "system_impersonation" if intent_result.get("is_system_impersonation") else "",
                    "tool_instruction" if intent_result.get("is_tool_instruction") else "",
                ],
                "intent": intent_result,
            },
        )

        # =================================================
        # 4. TOOL CONTEXT FIREWALL
        # =================================================
        try:
            intent_for_context = dict(intent_result or {})
            intent_for_context.setdefault("prompt", decoded_prompt)

            context_result = evaluate_tool_context(
                tool_name=tool_name,
                tool_args=tool_args,
                intent=intent_for_context,
                detector_result=detector_result,
                user_id=user_id,
            )
        except Exception as exc:
            context_result = {
                "blocked": False,
                "error": str(exc),
            }

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="tool_firewall",
            data={
                "risk_score": 0.70 if context_result.get("blocked") else 0.25 if tool_name else 0.05,
                "confidence": 0.80 if context_result.get("blocked") else 0.45,
                "labels": [
                    "tool_firewall",
                    "tool_blocked" if context_result.get("blocked") else "tool_allowed",
                    "financial_context" if (narrative_financial_context or _contains_any_token(str(tool_args or {}), FINANCIAL_CONTEXT_TERMS)) else "",
                ],
                "tool_present": bool(tool_name),
                "tool_name": tool_name,
                "tool_args": tool_args or {},
                "blocked": bool(context_result.get("blocked")),
                "approved": not bool(context_result.get("blocked")),
                "context_result": context_result,
                "narrative_detected": bool(narrative_detected),
            },
        )

        policy_matches: list[str] = []
        raw_policy_matches = context_result.get("policy_matches")
        if isinstance(raw_policy_matches, list):
            policy_matches.extend(str(item) for item in raw_policy_matches if str(item).strip())
        if detector_result.get("restricted_tool_calls"):
            policy_matches.append("restricted_tool_policy")
        policy_matches = sorted(set(policy_matches))

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="policy_matches",
            data={
                "risk_score": min(1.0, 0.12 * len(policy_matches)),
                "confidence": 0.70 if policy_matches else 0.25,
                "labels": policy_matches,
                "policy_matches": policy_matches,
            },
        )

        # =================================================
        # 5. MFA + TOOL INTERCEPTOR
        # =================================================
        try:
            if hitl_bypass_detected:
                interceptor_result = {
                    "tool_present": bool(tool_name),
                    "intercepted": bool(tool_name),
                    "approved": not bool(tool_name),
                    "requires_2fa": bool(tool_name),
                    "risk_level": "CRITICAL",
                    "risk_score": 100,
                    "reason": "HITL_BYPASS_ATTEMPT",
                    "status_code": 403 if tool_name else None,
                    "authority_impersonation": bool(authority_impersonation_detected),
                }

                security_audit_trail.append(
                    event_type="sentinel_core_tool_execution_blocked_hitl_bypass",
                    session_id=session_id,
                    user_id=user_id,
                    severity="CRITICAL",
                    data={
                        "tool_name": tool_name,
                        "attack_categories": list(detector_result.get("attack_categories") or []),
                        "requires_2fa": True,
                    },
                )

            # Context firewall blocks tool execution first.
            elif context_result.get("blocked"):
                interceptor_result = {
                    "tool_present": bool(tool_name),
                    "intercepted": True,
                    "approved": False,
                    "reason": "tool_context_firewall_block",
                    "context_result": context_result,
                }

            # Narrative injection fail-safe: no tool execution path.
            elif narrative_detected:
                interceptor_result = {
                    "tool_present": bool(tool_name),
                    "intercepted": bool(tool_name),
                    "approved": not bool(tool_name),
                    "requires_2fa": False,
                    "risk_level": "HIGH" if tool_name else "LOW",
                    "risk_score": 90 if tool_name else 55,
                    "reason": "narrative_prompt_injection_fail_safe",
                    "narrative_findings": narrative_findings,
                }

                security_audit_trail.append(
                    event_type="sentinel_core_tool_execution_blocked_narrative",
                    session_id=session_id,
                    user_id=user_id,
                    severity="HIGH",
                    data={
                        "tool_name": tool_name,
                        "confidence": round(narrative_confidence, 4),
                    },
                )

            else:
                enforce_mfa_for_flagged_tool(
                    detector_result=detector_result,
                    mfa_verified=bool(mfa_verified),
                    user_id=user_id,
                )

                interceptor_result = intercept_tool_call(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    two_factor_code=two_factor_code,
                    user_id=user_id,
                    metadata={
                        **dict(metadata or {}),
                        "prompt": decoded_prompt,
                        "tool_name": tool_name,
                        "tool_args": tool_args or {},
                    },
                    detector_result=detector_result,
                    mfa_verified=mfa_verified,
                )

        except HTTPException:
            raise

        except Exception as exc:
            interceptor_result = {
                "tool_present": bool(tool_name),
                "intercepted": True,
                "approved": False,
                "requires_2fa": bool(tool_name),
                "risk_level": "HIGH",
                "risk_score": 100,
                "reason": "interceptor_failure",
                "error": str(exc),
            }

        # =================================================
        # 6. OUTPUT LEAK SCANNER
        # =================================================
        try:
            output_scan_result = redact_sensitive_output(output_text)

        except Exception as exc:
            output_scan_result = {
                "redacted_output": output_text,
                "contains_sensitive_data": False,
                "error": str(exc),
            }

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="output_scan",
            data={
                "risk_score": 0.65 if output_scan_result.get("contains_sensitive_data") else 0.10,
                "confidence": 0.85 if output_scan_result.get("contains_sensitive_data") else 0.40,
                "labels": [
                    "output_generation",
                    "output_sensitive_data" if output_scan_result.get("contains_sensitive_data") else "",
                ],
                "contains_sensitive_data": bool(output_scan_result.get("contains_sensitive_data")),
                "redaction_count": int(output_scan_result.get("redaction_count", 0) or 0),
                "output_scan_result": output_scan_result,
            },
        )

        # =================================================
        # 7. RISK FUSION ENGINE
        # =================================================
        final_risk = self._compute_final_risk(
            detector_result,
            interceptor_result,
            decode_meta,
            output_scan_result,
        )

        # =================================================
        # 8. FINAL ACTION DECISION
        # =================================================
        if hitl_bypass_detected:
            baseline_action = "BLOCK"
        elif detector_result.get("has_narrative_injection"):
            baseline_action = "FORCE_REVIEW"
        elif final_risk["risk_level"] == "CRITICAL":
            baseline_action = "BLOCK"
        elif final_risk["risk_level"] == "HIGH":
            baseline_action = "BLOCK"
        elif final_risk["risk_level"] == "MEDIUM":
            baseline_action = "REVIEW"
        elif output_scan_result.get("contains_sensitive_data"):
            baseline_action = "REDACT"
        else:
            baseline_action = "ALLOW"

        action = baseline_action
        graph_override_reason: Optional[str] = None
        graph_override_applied = False

        graph_attack_chain_score = _safe_float(graph_context.get("attack_chain_score", 0.0), 0.0)
        graph_flags = dict(graph_context.get("attack_flags") or {})
        graph_recommendation = str(graph_context.get("override_recommendation") or "").upper()
        graph_reason = str(graph_context.get("override_reason") or "")

        if hitl_bypass_detected:
            action = "BLOCK"
            graph_override_reason = "hitl_bypass_attempt_detected"
            graph_override_applied = True
        elif graph_flags.get("narrative_tool_financial_chain"):
            action = "BLOCK"
            graph_override_reason = "narrative_tool_financial_chain_detected"
            graph_override_applied = True
        elif graph_flags.get("story_interpretation_tool_execution") and (
            narrative_financial_context or _contains_any_token(str(tool_args or {}), FINANCIAL_CONTEXT_TERMS)
        ):
            action = "BLOCK"
            graph_override_reason = "story_interpretation_tool_execution_chain"
            graph_override_applied = True
        elif graph_attack_chain_score > 0.75:
            action = "BLOCK"
            graph_override_reason = "attack_chain_score_threshold_exceeded"
            graph_override_applied = True
        elif graph_flags.get("repeated_escalation_pattern"):
            if graph_attack_chain_score >= 0.65 or final_risk["risk_level"] in {"HIGH", "CRITICAL"}:
                action = "BLOCK"
            else:
                action = "REVIEW"
            graph_override_reason = "repeated_escalation_pattern"
            graph_override_applied = True
        elif graph_recommendation in {"BLOCK", "REVIEW", "FORCE_REVIEW"}:
            action_priority = {
                "ALLOW": 0,
                "REDACT": 1,
                "REVIEW": 2,
                "FORCE_REVIEW": 3,
                "BLOCK": 4,
            }
            current_priority = action_priority.get(action, 0)
            suggested_priority = action_priority.get(graph_recommendation, 0)
            if suggested_priority > current_priority:
                action = graph_recommendation
                graph_override_reason = graph_reason or "graph_recommendation_override"
                graph_override_applied = True

        graph_context = update_context_graph(
            session_id=session_id,
            event_type="final_decision",
            data={
                "risk_score": _safe_float(final_risk.get("final_score", 0.0), 0.0),
                "confidence": _safe_float(final_risk.get("final_score", 0.0), 0.0),
                "labels": ["risk_event", action],
                "action": action,
                "risk_level": final_risk.get("risk_level"),
                "graph_override_applied": graph_override_applied,
                "graph_override_reason": graph_override_reason,
            },
        )

        graph_attack_chain_score = _safe_float(graph_context.get("attack_chain_score", graph_attack_chain_score), graph_attack_chain_score)
        graph_flags = dict(graph_context.get("attack_flags") or graph_flags)
        if graph_attack_chain_score > 0.75 and action != "BLOCK":
            action = "BLOCK"
            graph_override_reason = "attack_chain_score_threshold_exceeded"
            graph_override_applied = True

        if graph_flags.get("narrative_tool_financial_chain") and action != "BLOCK":
            action = "BLOCK"
            graph_override_reason = "narrative_tool_financial_chain_detected"
            graph_override_applied = True

        graph_nodes_map = graph_context.get("nodes") or {}
        graph_node_index: Dict[str, Dict[str, Any]] = {}
        for node_group in graph_nodes_map.values():
            if not isinstance(node_group, list):
                continue
            for node in node_group:
                if isinstance(node, dict):
                    node_id = str(node.get("node_id") or "")
                    if node_id:
                        graph_node_index[node_id] = node

        graph_path = list(graph_context.get("highest_risk_path") or [])
        contributing_nodes = [graph_node_index[node_id] for node_id in graph_path if node_id in graph_node_index]
        graph_decision_payload = {
            "session_id": session_id,
            "action": action,
            "baseline_action": baseline_action,
            "graph_override_applied": graph_override_applied,
            "override_reason": graph_override_reason,
            "graph_attack_chain_score": graph_attack_chain_score,
            "graph_cumulative_risk": _safe_float(graph_context.get("cumulative_risk", 0.0), 0.0),
            "detected_patterns": list(graph_context.get("detected_patterns") or []),
            "attack_flags": dict(graph_context.get("attack_flags") or {}),
            "highest_risk_path": graph_path,
            "contributing_nodes": contributing_nodes,
            "highest_risk_edge": dict(graph_context.get("highest_risk_edge") or {}),
            "risk_fusion_score": _safe_float(final_risk.get("final_score", 0.0), 0.0),
        }

        security_audit_trail.append(
            event_type="sentinel_core_graph_decision",
            session_id=session_id,
            user_id=user_id,
            correlation_id=session_id,
            severity="CRITICAL" if action == "BLOCK" else "HIGH" if action in {"FORCE_REVIEW", "REVIEW"} else "INFO",
            data=graph_decision_payload,
        )
        security_logger.log_event(
            "sentinel_core_graph_decision",
            graph_decision_payload,
            correlation_id=session_id,
            key=f"sentinel_core_graph_decision:{session_id}:{graph_context.get('total_events', 0)}",
        )

        return {
            "action": action,
            "session_id": session_id,
            "decoded_prompt": decoded_prompt,
            "decode_meta": decode_meta,
            "detector_result": detector_result,
            "intent_result": intent_result,
            "context_result": context_result,
            "interceptor_result": interceptor_result,
            "output_scan_result": output_scan_result,
            "risk_fusion": final_risk,
            "graph_context": graph_context,
            "graph_decision": {
                "override_applied": graph_override_applied,
                "override_reason": graph_override_reason,
                "baseline_action": baseline_action,
                "final_action": action,
            },
        }


# =========================================================
# GLOBAL INSTANCE
# =========================================================

sentinel_core_gateway = SentinelCoreSecurityGateway()


def run_sentinel_core_security(
    prompt: str,
    ai_output_text: str,
    mfa_verified: bool = False,
    user_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    tool_args: Optional[Dict[str, Any]] = None,
    two_factor_code: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    return sentinel_core_gateway.run_pipeline(
        prompt=prompt,
        ai_output_text=ai_output_text,
        mfa_verified=mfa_verified,
        user_id=user_id,
        tool_name=tool_name,
        tool_args=tool_args,
        two_factor_code=two_factor_code,
        metadata=metadata,
    )


def process_request(
    prompt: str,
    context: Optional[Dict[str, Any]] = None,
    llm_callable: Any = None,
) -> Dict[str, Any]:
    return sentinel_core_gateway.process_request(
        prompt=prompt,
        context=context,
        llm_callable=llm_callable,
    )
