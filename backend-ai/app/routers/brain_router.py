from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.sentinel_core import build_sentinel_verdict
from app.services.threat_detection import ThreatDetectionService

router = APIRouter(tags=["brain"])


class BrainAnalyzeRequest(BaseModel):
    prompt: str
    image_data: str | None = None


@router.post("/analyze")
async def analyze_with_brain(payload: BrainAnalyzeRequest, current_user: dict = Depends(get_current_user)):
    _ = current_user
    assessment = ThreatDetectionService().analyze(payload.prompt, security_tier="PRO")
    verdict = build_sentinel_verdict(assessment)
    threat_score = float(verdict.get("threat_score") or 0.0)

    if threat_score >= 0.85:
        threat_level = "CRITICAL"
        summary = f"High-confidence {verdict['category'].lower()} activity detected. Review the latest blocked traffic immediately."
    elif threat_score >= 0.5:
        threat_level = "ELEVATED"
        summary = f"Suspicious {verdict['category'].lower()} signals detected. Review recent logs and remediation history."
    else:
        threat_level = "SAFE"
        summary = "No high-confidence threat indicators detected in the supplied analyst context."

    analysis = {
        "summary": summary,
        "reasoning": verdict.get("detail"),
        "threat_level": threat_level,
        "confidence": round(threat_score * 100),
        "category": verdict.get("category"),
        "image_provided": bool(payload.image_data),
        "verdict": verdict,
    }
    return ok({"analysis": analysis})
