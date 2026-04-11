from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.scan import ScanJob
from app.schemas.scan_schema import ALLOWED_MODELS_BY_PROVIDER, ALLOWED_PROVIDERS, ALLOWED_SECURITY_TIERS
from app.services.security_service import scan_prompt
from app.services.sentinel_core import sentinel_blocks
from app.ai_service import get_security_analysis


def _validate_scan_config(provider: str, model: str, security_tier: str) -> None:
    # Production: enforce current model catalog even for internal callers.
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")
    if security_tier not in ALLOWED_SECURITY_TIERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported security tier: {security_tier}")
    allowed_models = ALLOWED_MODELS_BY_PROVIDER.get(provider, set())
    if model not in allowed_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported model for provider '{provider}': {model}",
        )


def create_scan_record(
    db: Session,
    user_id: int,
    target: str,
    provider: str = "openai",
    model: str = "gpt-5.4",
    security_tier: str = "PRO",
    scan_type: str = "prompt"
) -> ScanJob:
    """
    Create a full scan record with advanced threat detection.

    This function runs the complete scan pipeline:
    - Prompt injection detection
    - PII scanning & redaction
    - Malicious code / threat classification
    - Optional LLM security analysis (if not BLOCKED)
    """
    # -----------------------------
    # Run full prompt scan
    # -----------------------------
    _validate_scan_config(provider, model, security_tier)
    scan_result = scan_prompt(target, provider=provider, model=model, security_tier=security_tier)

    # -----------------------------
    # Run advanced security analysis if allowed
    # -----------------------------
    analysis = None
    sentinel_verdict = scan_result.get("sentinel_verdict") or {}
    if scan_result["status"] != "BLOCKED" and not sentinel_blocks(sentinel_verdict):
        analysis = get_security_analysis(scan_result["sanitized_content"] or target)

    # -----------------------------
    # Determine threat score (0..1)
    # -----------------------------
    threat_score = float(scan_result.get("threat_score") or 0.0)
    if threat_score <= 0.0:
        # Backwards-compatible fallback for older scan results.
        threat_score_map = {
            "BLOCKED": 0.99,
            "REDACTED": 0.65,
            "CLEAN": 0.1,
        }
        threat_score = float(threat_score_map.get(scan_result.get("status") or "CLEAN", 0.0))

    # -----------------------------
    # Create and persist ScanJob record
    # -----------------------------
    record = ScanJob(
        user_id=user_id,
        scan_type=scan_type,
        target=target,
        provider=provider,
        model=model,
        security_tier=security_tier,
        status=scan_result["status"],
        threat_score=threat_score,
        result={
            "scan_result": scan_result,
            "analysis": analysis,
        }
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return record


def get_scan_record(db: Session, user_id: int, scan_id: int):
    """
    Retrieve a single scan record for a user.
    """
    record = db.query(ScanJob).filter(ScanJob.id == scan_id, ScanJob.user_id == user_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Scan not found")
    return record


def list_scan_history(db: Session, user_id: int, limit: int = 100):
    """
    List the most recent scan records for a user.
    """
    return (
        db.query(ScanJob)
        .filter(ScanJob.user_id == user_id)
        .order_by(ScanJob.created_at.desc())
        .limit(limit)
        .all()
    )
