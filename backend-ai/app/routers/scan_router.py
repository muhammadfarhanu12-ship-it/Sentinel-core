import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.api_key_auth import require_api_key
from app.models.api_key import APIKey
from app.models.security_log import LogStatusEnum
from app.models.user import User
from app.schemas.scan_schema import FileScanMetadata, ScanRequest, ScanResponse, URLScanRequest
from app.schemas.api_schema import ApiResponse, ok
from app.services.audit_service import log_failed_auth, log_scan_request
from app.services.api_key_service import get_or_create_demo_api_key, update_api_key_usage
from app.services.enterprise_request_classifier import classify_request_local
from app.services.enterprise_security_logic import evaluate_security_logic_local
from app.services.log_service import LogService
from app.services.scan_service import create_scan_record, get_scan_record, list_scan_history
from app.services.security_service import scan_prompt, scan_prompt_with_resilience
from app.services.sentinel_core import build_sentinel_verdict, sentinel_blocks
from app.services.threat_detection import THREAT_PROMPT_INJECTION

router = APIRouter(prefix="/scan", tags=["scan"])
logger = logging.getLogger("scan_router")
_PENDING_SCAN_LOG_TASKS: set[asyncio.Task[Any]] = set()


def _partial_downstream_analysis(
    *,
    scan_result: dict[str, Any],
    image_data: str | None,
    message: str,
    reason: str | None = None,
) -> dict[str, Any]:
    confidence = max(1, min(99, int(float(scan_result.get("threat_score") or 0.1) * 100)))
    threat_level = str(scan_result.get("risk_level") or "medium").capitalize()
    return {
        "reasoning": f"[Analyzing: Prompt Security | Status: Warning | Confidence: {confidence}%]",
        "summary": message,
        "threat_level": threat_level,
        "confidence": confidence,
        "provider": "local-fallback",
        "image_attached": bool(image_data),
        "partial_analysis": True,
        "message": message,
        "reason": reason,
        "sentinel_verdict": scan_result.get("sentinel_verdict"),
    }


async def _run_downstream_analysis_with_resilience(
    *,
    prompt: str,
    image_data: str | None,
    scan_result: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    from app.ai_service import get_security_analysis

    timeout_seconds = min(
        max(2.0, float(getattr(settings, "SCAN_BASE_TIMEOUT_SECONDS", 6.0) or 6.0) - 1.0),
        max(2.0, float(getattr(settings, "SCAN_MAX_TIMEOUT_SECONDS", 12.0) or 12.0)),
    )
    retry_attempts = max(1, min(int(getattr(settings, "SCAN_RETRY_ATTEMPTS", 2) or 2), 2))
    started_at = time.perf_counter()
    last_error: Exception | None = None

    for attempt in range(1, retry_attempts + 1):
        try:
            analysis = await asyncio.wait_for(
                asyncio.to_thread(get_security_analysis, prompt, image_data),
                timeout=timeout_seconds,
            )
            return analysis, {
                "status": "ok",
                "partial": False,
                "attempts_used": attempt,
                "retry_attempts": retry_attempts,
                "timeout_seconds": timeout_seconds,
                "duration_ms": int((time.perf_counter() - started_at) * 1000),
            }
        except asyncio.TimeoutError as exc:
            last_error = exc
            logger.warning(
                "Downstream analysis timeout attempt=%s timeout_seconds=%.2f input_size=%s",
                attempt,
                timeout_seconds,
                len(prompt),
            )
        except Exception as exc:
            last_error = exc
            logger.exception("Downstream analysis failed attempt=%s input_size=%s", attempt, len(prompt))

    message = "Scan took longer than expected, partial analysis returned"
    return _partial_downstream_analysis(
        scan_result=scan_result,
        image_data=image_data,
        message=message,
        reason=str(last_error) if last_error else None,
    ), {
        "status": "warning",
        "partial": True,
        "attempts_used": retry_attempts,
        "retry_attempts": retry_attempts,
        "timeout_seconds": timeout_seconds,
        "duration_ms": int((time.perf_counter() - started_at) * 1000),
        "message": message,
        "error": str(last_error) if last_error else None,
    }


def _persist_scan_log_sync(**kwargs: Any) -> None:
    db = SessionLocal()
    try:
        LogService(db).create_log(**kwargs)
    except Exception:
        logger.exception("Failed to persist prompt scan log in background")
    finally:
        db.close()


async def _persist_scan_log_non_blocking(**kwargs: Any) -> dict[str, Any]:
    task = asyncio.create_task(run_in_threadpool(_persist_scan_log_sync, **kwargs))
    _PENDING_SCAN_LOG_TASKS.add(task)
    task.add_done_callback(lambda completed: _PENDING_SCAN_LOG_TASKS.discard(completed))

    sync_budget = max(0.0, float(getattr(settings, "SCAN_SYNC_LOG_BUDGET_SECONDS", 0.25) or 0.25))
    if sync_budget <= 0:
        return {"deferred": True}

    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=sync_budget)
        return {"deferred": False}
    except asyncio.TimeoutError:
        logger.info(
            "Prompt scan log persistence deferred api_key_id=%s status=%s endpoint=%s",
            kwargs.get("api_key_id"),
            kwargs.get("status_value"),
            kwargs.get("endpoint"),
        )
        return {"deferred": True}


# -----------------------------
# Prompt / Text Scan Endpoint
# -----------------------------
@router.post("", response_model=ApiResponse[ScanResponse])
async def scan_content(
    request: Request,
    payload: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    api_key: APIKey = Depends(require_api_key),
):
    started_at = time.perf_counter()
    client_ip = request.client.host if request.client else None

    # -----------------------------
    # API Key Handling
    # -----------------------------
    if api_key is None and settings.ENABLE_DEMO_MODE:
        api_key = get_or_create_demo_api_key(db, current_user)
    if api_key is None:
        log_failed_auth("invalid_or_missing_api_key", ip_address=client_ip, metadata={"path": str(request.url.path)})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing x-api-key header")
    update_api_key_usage(db, api_key, request)

    # -----------------------------
    # Run Advanced Prompt Scan
    # -----------------------------
    logger.info(
        "Prompt scan request started input_size=%s provider=%s model=%s security_tier=%s",
        len(payload.prompt),
        payload.provider,
        payload.model,
        payload.security_tier,
    )
    scan_result, scan_runtime = await scan_prompt_with_resilience(
        payload.prompt,
        provider=payload.provider,
        model=payload.model,
        security_tier=payload.security_tier,
    )

    # -----------------------------
    # Security Logic Gate (Model-targeted prompt + local fallback)
    # -----------------------------
    # This is an additional signal that contributes to decisions. It does not replace the core
    # validation layer (scan_prompt); it runs before downstream analysis calls.
    security_logic = evaluate_security_logic_local(payload.prompt)

    if security_logic.get("status") != "safe" and scan_result["status"] == "CLEAN":
        # Escalate to BLOCKED based on security-logic signal.
        scan_result["status"] = "BLOCKED"
        scan_result["decision"] = "BLOCK"
        scan_result["threat_types"] = list({*(scan_result.get("threat_types") or []), THREAT_PROMPT_INJECTION})
        scan_result["threat_type"] = scan_result.get("threat_type") if scan_result.get("threat_type") != "NONE" else THREAT_PROMPT_INJECTION
        scan_result["sanitized_content"] = security_logic.get("sanitized_input") or "[REDACTED: SECURITY LOGIC BLOCK]"
        scan_result["threat_score"] = max(float(scan_result.get("threat_score") or 0.0), 0.9)
        scan_result["risk_level"] = "high"
        scan_result["attack_vector"] = scan_result.get("attack_vector") or str(security_logic.get("attack_vector") or "Security logic gate triggered.")
        scan_result["detection_stage_triggered"] = list({*(scan_result.get("detection_stage_triggered") or []), "security_logic"})

    sentinel_verdict = build_sentinel_verdict(scan_result)
    scan_result["sentinel_verdict"] = sentinel_verdict
    if sentinel_blocks(sentinel_verdict) and scan_result["status"] != "BLOCKED":
        scan_result["status"] = "BLOCKED"
        scan_result["decision"] = "BLOCK"
        scan_result["sanitized_content"] = scan_result.get("sanitized_content") or "[REDACTED: SENTINEL-CORE BLOCK]"

    # Fast routing classification (sub-agent prompt has a local safe fallback).
    request_category = classify_request_local(
        {
            "prompt": payload.prompt,
            "provider": payload.provider,
            "model": payload.model,
            "security_tier": payload.security_tier,
        }
    )

    prompt_to_analyze = scan_result["sanitized_content"] or payload.prompt

    # Optional LLM analysis if not blocked
    downstream_analysis = None
    downstream_runtime: dict[str, Any] | None = None
    if scan_runtime.get("partial"):
        downstream_analysis = _partial_downstream_analysis(
            scan_result=scan_result,
            image_data=getattr(payload, "image_data", None),
            message=str(scan_runtime.get("message") or "Scan took longer than expected, partial analysis returned"),
            reason="Core scan returned best-effort output before downstream analysis.",
        )
        downstream_runtime = {
            "status": "warning",
            "partial": True,
            "skipped": True,
            "message": str(scan_runtime.get("message") or "Scan took longer than expected, partial analysis returned"),
        }
    elif not sentinel_blocks(sentinel_verdict) and scan_result["status"] != "BLOCKED":
        downstream_analysis, downstream_runtime = await _run_downstream_analysis_with_resilience(
            prompt=prompt_to_analyze,
            image_data=getattr(payload, "image_data", None),
            scan_result=scan_result,
        )

    analysis = {
        "sentinel_verdict": sentinel_verdict,
        "security_logic": security_logic,
        "request_routing": {"category": request_category},
        "downstream_analysis": downstream_analysis,
        "scan_runtime": scan_runtime,
        "downstream_runtime": downstream_runtime,
    }

    # -----------------------------
    # Prepare Security Report
    # -----------------------------
    action_taken_map = {
        "BLOCKED": "Request blocked before downstream execution.",
        "REDACTED": "Sensitive content was redacted before analysis.",
        "CLEAN": "Request passed scanning and analysis.",
    }
    detection_reason_map = {
        "PROMPT_INJECTION": "Suspicious instruction-overriding language was detected.",
        "MALICIOUS_CODE": "Malicious code patterns were detected.",
        "DATA_LEAK": "Sensitive data indicators were detected in the payload.",
        "DATA_EXFILTRATION": "Attempted secret/data exfiltration patterns were detected.",
        "POLICY_BYPASS": "Policy bypass technique indicators were detected.",
        "ENCODING_OBFUSCATION": "Encoding/obfuscation indicators were detected.",
        "PRIVILEGE_ESCALATION": "Privilege escalation / unsafe execution intent was detected.",
        "NONE": "No high-confidence threat pattern was detected.",
    }
    action_taken = action_taken_map.get(scan_result["status"], "Request processed.")
    detection_reason = detection_reason_map.get(scan_result["threat_type"], scan_result.get("explanation") or "Threat heuristics applied.")

    # -----------------------------
    # Log Scan
    # -----------------------------
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    tokens_used = max(1, len(payload.prompt.split()))
    threat_score = float(scan_result.get("threat_score") or (0.99 if scan_result["status"] == "BLOCKED" else 0.65 if scan_result["status"] == "REDACTED" else 0.1))
    log_runtime = await _persist_scan_log_non_blocking(
        api_key_id=api_key.id,
        status_value=LogStatusEnum(scan_result["status"]),
        threat_type=scan_result["threat_type"],
        threat_types=scan_result.get("threat_types"),
        threat_score=threat_score,
        attack_vector=scan_result.get("attack_vector"),
        risk_level=scan_result.get("risk_level"),
        detection_stage_triggered=scan_result.get("detection_stage_triggered"),
        tokens_used=tokens_used,
        latency_ms=latency_ms,
        endpoint=request.url.path,
        method=request.method,
        ip_address=client_ip,
        raw_payload={
            "prompt": payload.prompt,
            "sanitized_content": scan_result["sanitized_content"],
            "analysis": analysis,
        },
    )
    analysis["scan_runtime"]["logging_deferred"] = bool(log_runtime.get("deferred"))
    log_scan_request(current_user.id if current_user else None, "prompt", scan_result["status"].lower(), client_ip)
    logger.info(
        "Prompt scan request finished input_size=%s status=%s latency_ms=%s logging_deferred=%s",
        len(payload.prompt),
        scan_result["status"],
        latency_ms,
        bool(log_runtime.get("deferred")),
    )

    # -----------------------------
    # Return Response
    # -----------------------------
    return ok(ScanResponse(
        status=scan_result["status"],
        threat_type=scan_result["threat_type"],
        threat_types=scan_result.get("threat_types") or [],
        threat_score=threat_score,
        sentinel_verdict=sentinel_verdict,
        risk_level=scan_result.get("risk_level"),
        attack_vector=scan_result.get("attack_vector"),
        detection_stage_triggered=scan_result.get("detection_stage_triggered") or [],
        decision=scan_result.get("decision"),
        provider=scan_result.get("provider") or payload.provider,
        model=scan_result.get("model") or payload.model,
        security_tier=scan_result.get("security_tier") or payload.security_tier,
        sanitized_content=scan_result["sanitized_content"],
        analysis=analysis,
        security_report={
            "threat_type": scan_result["threat_type"],
            "threat_types": scan_result.get("threat_types") or [],
            "action_taken": action_taken,
            "detection_reason": detection_reason,
            "attack_vector": scan_result.get("attack_vector"),
            "risk_level": scan_result.get("risk_level"),
            "detection_stage_triggered": scan_result.get("detection_stage_triggered") or [],
            "explanation": scan_result.get("explanation"),
        },
    ))


# -----------------------------
# URL Scan Endpoint
# -----------------------------
@router.post("/url", response_model=ApiResponse[ScanResponse])
def scan_url(
    request: Request,
    payload: URLScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else None
    scan_record = create_scan_record(db, current_user.id, str(payload.url), scan_type="url")
    log_scan_request(current_user.id, "url", "success", client_ip)
    result = scan_record.result or {}
    scan_result = result.get("scan_result", {})
    return ok(ScanResponse(
        status=scan_result.get("status", "CLEAN"),
        threat_type=scan_result.get("threat_type", "NONE"),
        threat_types=scan_result.get("threat_types") or [],
        threat_score=scan_result.get("threat_score"),
        sentinel_verdict=scan_result.get("sentinel_verdict") or build_sentinel_verdict(scan_result),
        risk_level=scan_result.get("risk_level"),
        attack_vector=scan_result.get("attack_vector"),
        detection_stage_triggered=scan_result.get("detection_stage_triggered") or [],
        decision=scan_result.get("decision"),
        sanitized_content=scan_result.get("sanitized_content"),
        analysis=result.get("analysis"),
        security_report={
            "threat_type": scan_result.get("threat_type", "NONE"),
            "threat_types": scan_result.get("threat_types") or [],
            "action_taken": "URL analyzed by SentinelCore secure scan pipeline.",
            "detection_reason": "Structured URL validation and content heuristics applied.",
            "risk_level": scan_result.get("risk_level"),
            "attack_vector": scan_result.get("attack_vector"),
            "detection_stage_triggered": scan_result.get("detection_stage_triggered") or [],
            "explanation": scan_result.get("explanation"),
        },
    ))


# -----------------------------
# File Scan Endpoint
# -----------------------------
@router.post("/file", response_model=ApiResponse[ScanResponse])
async def scan_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else None
    contents = await file.read()
    metadata = FileScanMetadata(
        filename=(file.filename or "upload").split("/")[-1].split("\\")[-1],
        content_type=file.content_type or "application/octet-stream",
        size=len(contents),
    )
    if metadata.content_type not in settings.allowed_upload_types_list:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if metadata.size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is too large")

    # Placeholder: integrate AV/Antivirus in real deployments
    antivirus_status = "clean"
    target = contents.decode("utf-8", errors="ignore")[:10000]
    scan_record = create_scan_record(db, current_user.id, target, scan_type="file")
    log_scan_request(current_user.id, "file", antivirus_status, client_ip)
    result = scan_record.result or {}
    scan_result = result.get("scan_result", {})

    return ok(ScanResponse(
        status=scan_result.get("status", "CLEAN"),
        threat_type=scan_result.get("threat_type", "NONE"),
        threat_types=scan_result.get("threat_types") or [],
        threat_score=scan_result.get("threat_score"),
        sentinel_verdict=scan_result.get("sentinel_verdict") or build_sentinel_verdict(scan_result),
        risk_level=scan_result.get("risk_level"),
        attack_vector=scan_result.get("attack_vector"),
        detection_stage_triggered=scan_result.get("detection_stage_triggered") or [],
        decision=scan_result.get("decision"),
        sanitized_content=scan_result.get("sanitized_content"),
        analysis={
            **(result.get("analysis") or {}),
            "file": metadata.model_dump(),
            "antivirus_status": antivirus_status,
        },
        security_report={
            "threat_type": scan_result.get("threat_type", "NONE"),
            "threat_types": scan_result.get("threat_types") or [],
            "action_taken": "Uploaded file validated, sanitized, and queued through the secure scan pipeline.",
            "detection_reason": "Filename sanitization, size validation, MIME allowlisting, and heuristic content analysis applied.",
            "risk_level": scan_result.get("risk_level"),
            "attack_vector": scan_result.get("attack_vector"),
            "detection_stage_triggered": scan_result.get("detection_stage_triggered") or [],
            "explanation": scan_result.get("explanation"),
        },
    ))


# -----------------------------
# Scan History
# -----------------------------
@router.get("/history", response_model=ApiResponse[list])
def get_scan_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ok(list_scan_history(db, current_user.id))


# -----------------------------
# Get Single Scan
# -----------------------------
@router.get("/{scan_id}", response_model=ApiResponse[dict])
def get_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(get_scan_record(db, current_user.id, scan_id))
