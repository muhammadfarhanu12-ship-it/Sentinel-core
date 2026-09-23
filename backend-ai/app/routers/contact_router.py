from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.middleware.rate_limiter import check_rate_limit
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.auth_schema import MessageResponse
from app.schemas.contact_schema import ContactRequest
from app.services.contact_email_service import send_contact_email_async

router = APIRouter(tags=["contact"])


async def _apply_contact_rate_limit(request: Request) -> None:
    # The ASGI server resolves trusted proxy headers. Do not trust a caller's
    # raw X-Forwarded-For header, which could otherwise bypass this limit.
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip, scope="contact:ip", limit=5, window_seconds=900)


@router.post(
    "/contact",
    response_model=ApiResponse[MessageResponse],
    dependencies=[Depends(_apply_contact_rate_limit)],
)
async def submit_contact(payload: ContactRequest):
    result = await send_contact_email_async(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=str(payload.email),
        company=payload.company,
        message=payload.message,
    )
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="We couldn't send your message. Please try again later or email support@mefyx.com.",
        )
    return ok(MessageResponse(message="Thanks, we'll get back to you shortly"))
