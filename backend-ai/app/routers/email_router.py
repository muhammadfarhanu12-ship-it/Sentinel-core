from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.auth_schema import TestEmailRequest
from app.services.email_service import send_test_email_async

router = APIRouter(tags=["email"])


@router.post("/test-email", response_model=ApiResponse[dict])
async def test_email(payload: TestEmailRequest, current_user: dict = Depends(get_current_user)):
    result = await send_test_email_async(recipient_email=str(payload.email))
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.error or "Failed to send test email",
        )

    return ok(
        {
            "message": f"Test email sent successfully to {payload.email}.",
            "requested_by": current_user.get("email"),
            "message_id": result.message_id,
        }
    )
