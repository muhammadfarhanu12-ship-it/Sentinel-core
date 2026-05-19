from __future__ import annotations

from typing import Any, List

from app.security.detectors.prompt_injection_detector import detect_prompt_injection
from app.security.detectors.narrativeInjectionDetector import detect_narrative_injection
from app.security.detectors.indirectInjectionDetector import detect_indirect_injection, detect_indirect_prompt_injection
from app.security.detectors.semanticJailbreakDetector import detect_semantic_jailbreak
from app.security.detectors.suspiciousPatternDetector import detect_suspicious_patterns
from app.security.preprocessors.decodeLayer import decode_layer, generate_decoded_variants
from app.security.scanners.piiScanner import scan_pii
from app.security.utils.text import normalize_text
from app.security.utils.types import DecodeResult, DetectionMatch, SeverityLevel


def _prepare_content(content: str) -> tuple[str, DecodeResult | None]:
    """
    Normalize + decode multi-layer obfuscation before scanning.
    """
    if not content:
        return "", None

    # Step 1: decode obfuscated payloads (base64/hex/url/morse)
    decoded_result = decode_layer.process(content)
    decoded = decoded_result.content if decoded_result else content

    # Step 2: normalize text (casefold, whitespace cleanup, etc.)
    return normalize_text(decoded), decoded_result


def _severity_from_risk_level(risk_level: str) -> SeverityLevel:
    level = str(risk_level or "").upper()
    if level == "CRITICAL":
        return SeverityLevel.CRITICAL
    if level == "HIGH":
        return SeverityLevel.HIGH
    if level == "MEDIUM":
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW


def _risk_level_from_score(score: int) -> str:
    if score >= 86:
        return "critical"
    if score >= 46:
        return "high"
    if score >= 21:
        return "medium"
    return "low"


def _verdict_from_score(score: int) -> str:
    if score >= 71:
        return "block"
    if score >= 21:
        return "warn"
    return "allow"


def _signal_severity(score: int) -> SeverityLevel:
    if score >= 86:
        return SeverityLevel.CRITICAL
    if score >= 46:
        return SeverityLevel.HIGH
    if score >= 21:
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW


def scan_prompt(content: str, context: dict | None = None) -> dict[str, Any]:
    """
    Rich prompt scan used by the enforcement layer and tests.
    Backward compatible: existing callers can keep using scan_prompt_security()
    for DetectionMatch lists, while this function exposes the expanded result
    shape requested by the gateway API.
    """
    context = dict(context or {})
    decoded = generate_decoded_variants(content or "", max_depth=int(context.get("max_decode_depth") or 2))
    decode_signals = list(decoded.get("signals") or [])

    best: dict[str, Any] | None = None
    all_categories: set[str] = set()
    all_signals: list[dict[str, Any]] = []
    decoded_variants: list[dict[str, Any]] = []

    for variant in decoded.get("variants", []) or []:
        variant_context = {
            **context,
            "variant_source": variant.get("source") or "original",
            "decode_signals": decode_signals,
        }
        indirect = detect_indirect_prompt_injection(str(variant.get("text") or ""), variant_context)
        score = int(indirect.get("risk_score") or 0)
        if best is None or score > int(best.get("risk_score") or 0):
            best = indirect
        all_categories.update(indirect.get("detected_categories") or [])
        all_signals.extend(indirect.get("matched_signals") or [])
        if variant.get("source") != "original":
            decoded_variants.append(
                {
                    "source": variant.get("source"),
                    "text": variant.get("text"),
                    "confidence": variant.get("confidence"),
                }
            )

    best = best or {
        "verdict": "allow",
        "risk_score": 0,
        "risk_level": "low",
        "detected_categories": [],
        "matched_signals": [],
        "explanation": "No indirect prompt injection signals detected.",
        "recommended_action": "Allow.",
    }

    risk_score = int(best.get("risk_score") or 0)
    if "zero_width_chars_detected" in decode_signals:
        all_categories.add("unicode_obfuscation")
    if any(signal.endswith("_payload_detected") or signal.endswith("_payload_decoded") for signal in decode_signals):
        if all_categories - {"unicode_obfuscation"}:
            all_categories.add("encoded_instruction")

    return {
        "verdict": _verdict_from_score(risk_score),
        "risk_score": risk_score,
        "risk_level": _risk_level_from_score(risk_score),
        "detected_categories": sorted(all_categories),
        "matched_signals": all_signals,
        "decoded_variants": decoded_variants,
        "decode_signals": decode_signals,
        "explanation": best.get("explanation"),
        "recommended_action": best.get("recommended_action"),
        "original": decoded.get("original", content or ""),
    }


def scan_prompt_security(
    content: str,
    history: list[str] | None = None,
    context: dict | None = None,
) -> List[DetectionMatch]:
    """
    Unified security scanner:
    Decode -> Normalize -> Multi-detector scan
    """

    findings: List[DetectionMatch] = []

    try:
        rich_result = scan_prompt(content, context=context)
        prepared_content, decoded_result = _prepare_content(content)
        raw_normalized = normalize_text(content or "")
        combined_context = raw_normalized
        if prepared_content and prepared_content != raw_normalized:
            combined_context = f"{raw_normalized}\n{prepared_content}".strip()

        detector_result = detect_prompt_injection(
            prompt=raw_normalized,
            decoded_prompt=prepared_content or raw_normalized,
        )
        attack_categories = set(detector_result.get("attack_categories") or [])
        matched_findings = list(detector_result.get("matched_findings") or [])
        detector_score = float(detector_result.get("threat_score") or 0.0)
        detector_risk_level = str(detector_result.get("risk_level") or "LOW")

        if bool(detector_result.get("is_flagged")):
            findings.append(
                DetectionMatch(
                    detector="prompt_injection_detector",
                    label=(
                        "hitl_bypass_attempt"
                        if "HITL_BYPASS_ATTEMPT" in attack_categories
                        else "prompt_injection_risk"
                    ),
                    reason=(
                        "Financial authority impersonation + HITL bypass chain detected."
                        if "HITL_BYPASS_ATTEMPT" in attack_categories
                        else "Prompt injection detector flagged suspicious instruction patterns."
                    ),
                    confidence=(
                        max(detector_score, 0.95)
                        if "HITL_BYPASS_ATTEMPT" in attack_categories
                        else max(detector_score, 0.55)
                    ),
                    severity=(
                        SeverityLevel.CRITICAL
                        if "HITL_BYPASS_ATTEMPT" in attack_categories
                        else _severity_from_risk_level(detector_risk_level)
                    ),
                    metadata={
                        "threat_score": detector_score,
                        "risk_level": detector_risk_level,
                        "matched_findings": matched_findings,
                        "attack_categories": sorted(attack_categories),
                        "verdict_label": detector_result.get("verdict_label"),
                        "category": detector_result.get("category"),
                        "recommended_action": detector_result.get("recommended_action"),
                        "decoded_variant_analyzed": bool(prepared_content and prepared_content != raw_normalized),
                        "decoded_artifact_count": int(len((decoded_result.artifacts if decoded_result else []) or [])),
                    },
                )
            )

        if int(rich_result.get("risk_score") or 0) > 0:
            findings.append(
                DetectionMatch(
                    detector="indirect_prompt_injection_detector",
                    label="indirect_prompt_injection",
                    reason=str(rich_result.get("explanation") or "Indirect prompt injection signals detected."),
                    confidence=max(0.30, min(1.0, int(rich_result.get("risk_score") or 0) / 100.0)),
                    severity=_signal_severity(int(rich_result.get("risk_score") or 0)),
                    metadata={
                        "risk_score": int(rich_result.get("risk_score") or 0),
                        "risk_level": rich_result.get("risk_level"),
                        "verdict": rich_result.get("verdict"),
                        "detected_categories": rich_result.get("detected_categories") or [],
                        "matched_signals": rich_result.get("matched_signals") or [],
                        "decoded_variants": rich_result.get("decoded_variants") or [],
                        "decode_signals": rich_result.get("decode_signals") or [],
                        "recommended_action": rich_result.get("recommended_action"),
                    },
                )
            )

        if "authority_impersonation" in attack_categories:
            findings.append(
                DetectionMatch(
                    detector="prompt_injection_detector",
                    label="authority_impersonation",
                    reason="Authority impersonation narrative detected in financial execution context.",
                    confidence=max(detector_score, 0.92),
                    severity=SeverityLevel.CRITICAL,
                    metadata={
                        "attack_categories": sorted(attack_categories),
                        "matched_findings": matched_findings,
                    },
                )
            )

        # Run narrative detector first so downstream layers can react early.
        findings.extend(
            detect_narrative_injection(content, decoded_prompt=prepared_content)
        )

        findings.extend(
            detect_semantic_jailbreak(combined_context, history=history)
        )

        findings.extend(
            detect_indirect_injection(combined_context)
        )

        findings.extend(
            detect_suspicious_patterns(combined_context)
        )

        findings.extend(
            scan_pii(combined_context)
        )

        return findings

    except Exception as exc:
        # Fail-safe: never allow bypass due to scanner crash
        return [
            DetectionMatch(
                detector="prompt_scanner",
                label="scanner_failure_fallback",
                reason=f"Prompt scanner failed safely: {exc}",
                confidence=1.0,
                severity=SeverityLevel.CRITICAL,
                metadata={"fallback": True},
            )
        ]
