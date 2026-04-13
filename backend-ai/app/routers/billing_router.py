from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ok
from app.services.dashboard_service import create_checkout_session, get_subscription

router = APIRouter(tags=["billing"])


class CheckoutRequest(BaseModel):
    plan_name: str = Field(..., max_length=64)


@router.get("/subscription")
async def read_subscription(request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await get_subscription(request, current_user))


@router.post("/create-checkout-session")
async def create_checkout(payload: CheckoutRequest, request: Request, current_user: dict = Depends(get_current_user)):
    return ok(await create_checkout_session(request, current_user, plan_name=payload.plan_name))
