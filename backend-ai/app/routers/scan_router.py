from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import persist_scan_result
from app.services.security_service import scan_prompt_with_resilience

router = APIRouter(tags=["scan"])


class ScanRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    provider: str = Field(default="openai", max_length=64)
    model: str = Field(default="gpt-5.4", max_length=128)
    securityTier: str | None = Field(default=None, max_length=32)
    security_tier: str | None = Field(default=None, max_length=32)


@router.post("")
async def scan_prompt(payload: ScanRequest, request: Request, current_user: dict = Depends(get_current_user)):
    security_tier = str(payload.securityTier or payload.security_tier or "PRO").upper()
    result, runtime = await scan_prompt_with_resilience(
        payload.prompt,
        provider=payload.provider,
        model=payload.model,
        security_tier=security_tier,
    )
    runtime.setdefault("logging_deferred", False)

    response_data = {
        **result,
        "security_report": {
            "threat_type": result.get("threat_type"),
            "action_taken": (
                "Blocked malicious or unsafe request."
                if result.get("status") == "BLOCKED"
                else "Redacted sensitive content before downstream processing."
                if result.get("status") == "REDACTED"
                else "Allowed request to proceed."
            ),
            "detection_reason": result.get("explanation"),
        },
        "analysis": {
            "reasoning": result.get("explanation"),
            "downstream_analysis": None
            if result.get("status") != "CLEAN"
            else {
                "status": "approved",
                "provider": payload.provider,
                "model": payload.model,
            },
            "scan_runtime": runtime,
        },
    }
    persisted_log = await persist_scan_result(
        request,
        current_user,
        prompt=payload.prompt,
        provider=payload.provider,
        model=payload.model,
        security_tier=security_tier,
        scan_result=result,
        runtime=runtime,
    )
    response_data["request_id"] = persisted_log.get("request_id")
    return ok(response_data)
