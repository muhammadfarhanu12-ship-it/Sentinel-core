from __future__ import annotations

import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.middleware.auth_middleware import get_current_user
from app.schemas.api_schema import ApiResponse, ok
from app.schemas.billing_schema import BillingPlanResponse, SubscribeRequest
from app.services.billing_service import get_billing_plan, subscribe_user

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("", response_model=ApiResponse[BillingPlanResponse])
def get_billing_info(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(get_billing_plan(db, current_user))


@router.get("/subscription", response_model=ApiResponse[BillingPlanResponse])
def get_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(get_billing_plan(db, current_user))


def _stripe_price_for_plan(plan_name: str) -> str | None:
    plan = (plan_name or "").upper()
    if plan == "PRO":
        return settings.STRIPE_PRICE_PRO
    if plan == "BUSINESS":
        return settings.STRIPE_PRICE_BUSINESS
    return None


@router.post("/create-checkout-session", response_model=ApiResponse[dict])
def create_checkout_session(
    request: Request,
    payload: SubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = (payload.plan_name or "").upper()
    if plan not in {"PRO", "BUSINESS"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported plan_name")

    # If Stripe is not configured, fall back to local subscription persistence so the app still works end-to-end.
    if not settings.STRIPE_SECRET_KEY:
        sub = subscribe_user(db, current_user, plan)
        return ok({"mode": "local", "subscription_id": sub.id, "plan_name": sub.plan_name, "status": sub.status})

    price_id = _stripe_price_for_plan(plan)
    if not price_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Missing Stripe price id for plan {plan}")

    origin = request.headers.get("origin") or settings.FRONTEND_URL
    success_url = f"{origin}/app/billing?checkout=success"
    cancel_url = f"{origin}/app/billing?checkout=cancel"

    form = {
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        # Store user id for correlation in webhook flows (optional)
        "client_reference_id": str(current_user.id),
    }
    data = urllib.parse.urlencode(form).encode("utf-8")

    req = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.STRIPE_SECRET_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 (explicit timeout + trusted destination)
            body = resp.read().decode("utf-8")
            session = json.loads(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe request failed: {exc}") from exc

    # Persist local "pending" subscription so UI can show status even before webhooks.
    sub = subscribe_user(db, current_user, plan)
    return ok({"mode": "stripe", "checkout_url": session.get("url"), "session_id": session.get("id"), "subscription_id": sub.id})
