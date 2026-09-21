import json

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import create_checkout_session, get_subscription
from app.services.creem_service import create_customer_portal, process_webhook, verify_webhook_signature

router = APIRouter(tags=["billing"])


class CheckoutRequest(BaseModel):
    plan_name: str = Field(..., max_length=64)


@router.get("/subscription")
async def read_subscription(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await get_subscription(request, current_user))


@router.post("/create-checkout-session")
async def create_checkout(payload: CheckoutRequest, request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await create_checkout_session(request, current_user, plan_name=payload.plan_name))


@router.post("/customer-portal")
async def customer_portal(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await create_customer_portal(request, current_user))


@router.post("/webhooks/creem")
async def creem_webhook(request: Request):
    raw_body = await request.body()
    verify_webhook_signature(raw_body, request.headers.get("creem-signature"))
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(400, "Invalid payment webhook JSON") from exc
    if not isinstance(event, dict):
        raise HTTPException(400, "Invalid payment webhook event")
    return ok(await process_webhook(request, event))
