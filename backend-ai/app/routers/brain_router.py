from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.tier import require_scan_entitlement
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import check_rate_limit
from app.schemas.api_schema import ok
from app.services.dashboard_service import tier_for
from app.services.security_service import scan_prompt_with_resilience

router = APIRouter(tags=["brain"])


class BrainAnalyzeRequest(BaseModel):
    prompt: str
    image_data: str | None = None


def _security_state_from_scan(scan_result: dict[str, object]) -> dict[str, object]:
    status = str(scan_result.get("status") or "").upper()
    requires_2fa = bool(scan_result.get("requires_2fa"))
    review_required = bool(scan_result.get("review_required"))
    risk_score = int(scan_result.get("risk_score") or 0)
    suspicious = bool(status in {"BLOCKED", "REDACTED"} or review_required or risk_score >= 70)
    return {
        "blocked_request": status == "BLOCKED",
        "mfa_required": status == "BLOCKED" and requires_2fa,
        "suspicious_activity_detected": suspicious,
        "review_required": review_required,
        "requires_2fa": requires_2fa,
    }


@router.post("/analyze")
async def analyze_with_brain(payload: BrainAnalyzeRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    limits = require_scan_entitlement(
        active_tier=tier_for(current_user),
        requested_tier="PRO",
        provider="openai",
        model="gpt-5.4",
        prompt=payload.prompt,
    )
    check_rate_limit(user_id or str(current_user.get("email") or "anonymous"), "brain", limits.requests_per_minute, 60)
    scan_result, runtime = await scan_prompt_with_resilience(
        payload.prompt,
        provider="openai",
        model="gpt-5.4",
        security_tier="PRO",
        session_id=user_id or None,
        conversation_id=user_id or None,
        user_id=user_id or None,
        metadata={"route": "brain_analyze"},
    )
    verdict = dict(scan_result.get("sentinel_verdict") or {})
    threat_score = float(verdict.get("threat_score") or scan_result.get("threat_score") or 0.0)

    category = str(verdict.get("category") or "Unknown")
    if str(scan_result.get("status") or "").upper() == "BLOCKED" or threat_score >= 0.85:
        threat_level = "CRITICAL"
        summary = f"High-confidence {category.lower()} activity detected. Review the latest blocked traffic immediately."
    elif threat_score >= 0.5:
        threat_level = "ELEVATED"
        summary = f"Suspicious {category.lower()} signals detected. Review recent logs and remediation history."
    else:
        threat_level = "SAFE"
        summary = "No high-confidence threat indicators detected in the supplied analyst context."

    analysis = {
        "summary": summary,
        "reasoning": verdict.get("detail"),
        "threat_level": threat_level,
        "confidence": round(threat_score * 100),
        "category": category,
        "image_provided": bool(payload.image_data),
        "verdict": verdict,
        "security_state": _security_state_from_scan(scan_result),
        "scan_runtime": runtime,
    }
    return ok({"analysis": analysis})
