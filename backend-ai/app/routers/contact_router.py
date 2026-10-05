from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies.public_forms import protect_public_form
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.auth_schema import MessageResponse
from app.schemas.contact_schema import ContactRequest
from app.services.contact_email_service import send_contact_email_async

router = APIRouter(tags=["contact"])


@router.post(
    "/contact",
    response_model=ApiResponse[MessageResponse],
    dependencies=[Depends(protect_public_form("contact"))],
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
