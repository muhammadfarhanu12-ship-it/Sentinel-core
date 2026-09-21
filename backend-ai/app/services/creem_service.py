"""Creem checkout and signed, replay-safe subscription synchronization.

The user document is the atomic entitlement source; billing is a recoverable
projection. No checkout request or browser redirect grants paid access.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from bson import ObjectId
from fastapi import HTTPException, Request
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.tier import tier_limits_for
from app.db.mongo import get_database_from_request

# An expired subscription can still retry payment; only cancellation ends billing.
TERMINAL_STATUSES = {"canceled"}
REVOKED_STATUSES = {"canceled", "expired", "unpaid", "paused"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mode() -> str:
    return "test" if settings.CREEM_TEST_MODE else "prod"


def _products() -> dict[str, str | None]:
    return {"PRO": settings.CREEM_PRODUCT_ID_PRO, "BUSINESS": settings.CREEM_PRODUCT_ID_BUSINESS}


def payment_configured(tier: str | None = None) -> bool:
    products = _products()
    values = [products.get(tier)] if tier else list(products.values())
    return bool(settings.CREEM_API_KEY and settings.CREEM_WEBHOOK_SECRET and all(values)
                and len({value for value in products.values() if value}) == len([value for value in products.values() if value]))


def _identifier(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("id")
    return value if isinstance(value, str) and value else None


def _user_query(user_id: str) -> dict:
    choices = [{"_id": user_id}, {"id": user_id}]
    if ObjectId.is_valid(user_id):
        choices.append({"_id": ObjectId(user_id)})
    return {"$or": choices}


async def _user(database, user_id: str) -> dict:
    user = await database.get_collection("users").find_one(_user_query(user_id))
    if user is None:
        raise HTTPException(404, "Billing account not found")
    return user


def _safe_url(value: Any) -> str:
    parsed = urlparse(value if isinstance(value, str) else "")
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or not (parsed.hostname == "creem.io" or parsed.hostname.endswith(".creem.io"))):
        raise HTTPException(502, "Payment provider returned an invalid checkout link")
    return str(value)


async def _api(method: str, path: str, *, payload: dict | None = None, params: dict | None = None) -> dict:
    if not settings.CREEM_API_KEY:
        raise HTTPException(503, "Payment processing is not configured")
    base = "https://test-api.creem.io" if settings.CREEM_TEST_MODE else "https://api.creem.io"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(method, f"{base}/v1/{path}",
                                            headers={"x-api-key": settings.CREEM_API_KEY},
                                            json=payload, params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Invalid payment response")
        return data
    except (httpx.HTTPError, ValueError) as exc:
        # Provider bodies may contain customer data or credentials.
        raise HTTPException(502, "Payment provider is unavailable. Please retry shortly.") from exc


async def create_customer_portal(request: Request, current_user: dict) -> dict:
    database = get_database_from_request(request)
    user_id = str(current_user.get("id") or current_user.get("_id"))
    user = await _user(database, user_id)
    billing = user.get("creem_billing") or {}
    customer_id = billing.get("creem_customer_id")
    if not customer_id or billing.get("mode") != _mode():
        raise HTTPException(409, "No payment account is available for this environment")
    data = await _api("POST", "customers/billing", payload={"customer_id": customer_id})
    return {"customer_portal_url": _safe_url(data.get("customer_portal_link"))}


async def create_checkout_session(request: Request, current_user: dict, *, plan_name: str) -> dict:
    tier = str(plan_name).strip().upper()
    if tier not in {"FREE", "PRO", "BUSINESS"}:
        raise HTTPException(400, "Unknown subscription plan")
    if tier != "FREE" and not payment_configured(tier):
        return {"status": "payment_not_configured", "payment_collection": "not_configured",
                "message": "Secure checkout is not configured. No subscription change was applied."}

    database = get_database_from_request(request)
    users = database.get_collection("users")
    checkouts = database.get_collection("billing_checkouts")
    user_id = str(current_user.get("id") or current_user.get("_id"))
    user = await _user(database, user_id)
    billing = user.get("creem_billing") or {}
    subscription_id = billing.get("creem_subscription_id")
    if subscription_id and billing.get("mode") != _mode():
        raise HTTPException(409, "This subscription belongs to another payment environment. Contact support.")
    if subscription_id and billing.get("status") not in TERMINAL_STATUSES:
        if tier == "FREE":
            await _api("POST", f"subscriptions/{subscription_id}/cancel",
                       payload={"mode": "scheduled", "onExecute": "cancel"})
            return {"status": "cancellation_scheduled",
                    "message": "Cancellation requested. Your paid plan remains available until the billing period ends."}
        raise HTTPException(409, "Use Manage billing to change your existing subscription.")

    pending_id = user.get("creem_checkout_request_id")
    if pending_id:
        pending = await checkouts.find_one({"_id": pending_id})
        if pending and pending.get("checkout_id"):
            remote = await _api("GET", "checkouts", params={"checkout_id": pending["checkout_id"]})
            if remote.get("status") == "expired":
                await users.update_one({"_id": user["_id"], "creem_checkout_request_id": pending_id},
                                       {"$unset": {"creem_checkout_request_id": ""}})
                pending_id = None
            elif tier == pending.get("tier") and pending.get("mode") == _mode() and remote.get("status") == "pending":
                return {"checkout_url": _safe_url(remote.get("checkout_url") or pending.get("checkout_url")),
                        "checkout_id": pending["checkout_id"], "status": "checkout_pending"}
        if pending_id:
            raise HTTPException(409, "A checkout is already pending. Complete it or wait for it to expire before changing plans.")

    if tier == "FREE":
        # Free accounts require no provider call. Never locally cancel a live subscription.
        free_limit = tier_limits_for("FREE").monthly_requests
        free_billing = {**billing, "tier": "FREE", "monthly_limit": free_limit,
                        "status": billing.get("status", "active"), "updated_at": _now()}
        changed = await users.update_one(
            {"_id": user["_id"], "creem_billing.event_key": billing.get("event_key")},
            {"$set": {"tier": "FREE", "monthly_limit": free_limit, "creem_billing": free_billing}},
        )
        if not changed.matched_count:
            raise HTTPException(409, "Your subscription changed. Refresh billing and try again.")
        return {"tier": "FREE", "status": "active", "message": "Your account is on the Free plan."}

    request_id = uuid4().hex
    product_id = _products()[tier]
    await checkouts.insert_one({"_id": request_id, "user_id": user_id, "tier": tier,
                               "product_id": product_id, "mode": _mode(), "created_at": _now()})
    claimed = await users.update_one({"_id": user["_id"], "creem_checkout_request_id": {"$exists": False},
                                     "creem_billing.event_key": billing.get("event_key")},
                                     {"$set": {"creem_checkout_request_id": request_id}})
    if not claimed.matched_count:
        raise HTTPException(409, "A checkout is already being created. Please retry shortly.")
    try:
        data = await _api("POST", "checkouts", payload={
            "product_id": product_id, "request_id": request_id,
            "success_url": settings.FRONTEND_URL.rstrip("/") + "/app/billing?checkout=success",
            "customer": {"id": billing["creem_customer_id"]} if billing.get("creem_customer_id") else {"email": user["email"]},
            "metadata": {"user_id": user_id, "target_tier": tier, "checkout_request_id": request_id},
        })
    except HTTPException as exc:
        # A timeout/5xx may have created a checkout. Keep its reference for webhook
        # reconciliation instead of risking a second charge on an automatic retry.
        cause = exc.__cause__
        if isinstance(cause, httpx.HTTPStatusError) and 400 <= cause.response.status_code < 500:
            await users.update_one({"_id": user["_id"], "creem_checkout_request_id": request_id},
                                   {"$unset": {"creem_checkout_request_id": ""}})
        raise
    checkout_id = _identifier(data)
    if not checkout_id:
        raise HTTPException(502, "Payment provider returned an invalid checkout session")
    checkout_url = _safe_url(data.get("checkout_url"))
    await checkouts.update_one({"_id": request_id}, {"$set": {"checkout_id": checkout_id, "checkout_url": checkout_url}})
    return {"checkout_url": checkout_url, "checkout_id": checkout_id, "status": "checkout_pending"}


def verify_webhook_signature(raw_body: bytes, signature: str | None) -> None:
    if not settings.CREEM_WEBHOOK_SECRET:
        raise HTTPException(503, "Payment webhooks are not configured")
    if not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        raise HTTPException(401, "Invalid payment webhook signature")
    expected = hmac.new(settings.CREEM_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(401, "Invalid payment webhook signature")


def _date(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


async def process_webhook(request: Request, event: dict) -> dict:
    """Called only after signature verification by the webhook route."""
    event_id, event_type = event.get("id"), event.get("eventType")
    obj, timestamp = event.get("object"), event.get("created_at")
    if (not isinstance(event_id, str) or not event_id or not isinstance(event_type, str)
            or not isinstance(obj, dict) or type(timestamp) is not int or not 0 < timestamp < 10**15):
        raise HTTPException(400, "Invalid payment webhook event")
    if obj.get("mode") is not None and obj["mode"] != _mode():
        raise HTTPException(400, "Payment webhook environment mismatch")

    paid = event_type in {"checkout.completed", "subscription.paid"}
    status = event_type.removeprefix("subscription.")
    if event_type == "subscription.update":
        status = obj.get("status")
    if not paid and (not event_type.startswith("subscription.") or not isinstance(status, str)
                     or status not in REVOKED_STATUSES | {"active", "past_due", "scheduled_cancel"}):
        return {"status": "ignored"}
    if event_type == "checkout.completed":
        order = obj.get("order") or {}
        if obj.get("status") != "completed" or not isinstance(order, dict) or order.get("status") != "paid":
            return {"status": "ignored"}
        subscription = obj.get("subscription")
        subscription_id = _identifier(subscription)
        sub = subscription if isinstance(subscription, dict) else {}
    else:
        order, sub = {}, obj
        subscription_id = _identifier(obj)
    customer_id = _identifier(obj.get("customer")) or _identifier(sub.get("customer"))
    product_id = _identifier(obj.get("product")) or _identifier(sub.get("product")) or _identifier(order.get("product"))
    tier = next((name for name, value in _products().items() if value and value == product_id), None)
    if not subscription_id or not customer_id or not tier:
        raise HTTPException(400, "Unknown payment product, customer, or subscription")
    metadata = obj.get("metadata") or sub.get("metadata") or {}
    if not isinstance(metadata, dict):
        raise HTTPException(400, "Invalid payment metadata")

    database = get_database_from_request(request)
    users, events = database.get_collection("users"), database.get_collection("billing_webhook_events")
    if await events.find_one({"_id": event_id}):
        return {"status": "duplicate"}
    user = await users.find_one({"creem_billing.creem_subscription_id": subscription_id})
    if not paid and status == "active" and (user is None or not (user.get("creem_billing") or {}).get("payment_confirmed")):
        return {"status": "ignored"}
    request_id = obj.get("request_id") or metadata.get("checkout_request_id")
    checkout = None
    if user is None:
        if not isinstance(request_id, str):
            raise HTTPException(409, "Payment is not yet linked to a checkout; retry delivery")
        checkout = await database.get_collection("billing_checkouts").find_one({"_id": request_id})
        if (not checkout or checkout.get("product_id") != product_id or checkout.get("mode") != _mode()):
            raise HTTPException(400, "Payment does not match a checkout")
        if metadata.get("user_id") and metadata["user_id"] != checkout["user_id"]:
            raise HTTPException(400, "Payment account mismatch")
        user = await _user(database, checkout["user_id"])
    user_id = str(user.get("id") or user["_id"])
    if paid:
        status = "scheduled_cancel" if sub.get("status") == "scheduled_cancel" else "active"
    priority = 3 if status in REVOKED_STATUSES else 2 if paid else 1
    event_key = timestamp * 10 + priority
    for attempt in range(8):
        previous = user.get("creem_billing") or {}
        if metadata.get("user_id") and metadata["user_id"] != user_id:
            raise HTTPException(400, "Payment account mismatch")
        if previous.get("creem_customer_id") and previous["creem_customer_id"] != customer_id:
            raise HTTPException(400, "Payment customer mismatch")
        if (previous.get("creem_subscription_id") not in {None, subscription_id}
                and previous.get("status") not in TERMINAL_STATUSES):
            if not paid:
                return {"status": "ignored"}
            raise HTTPException(409, "Another subscription is already linked to this account")
        same_subscription = previous.get("creem_subscription_id") == subscription_id
        if not paid and status not in REVOKED_STATUSES and (
                not same_subscription or not previous.get("payment_confirmed")
                or previous.get("creem_product_id") != product_id):
            raise HTTPException(409, "Awaiting payment confirmation; retry delivery")
        previous_key = previous.get("event_key")
        if previous_key is not None and previous_key > event_key:
            break
        # Recompute against the current user on every compare-and-set retry.
        access_tier = tier if paid else "FREE" if status in REVOKED_STATUSES else str(user.get("tier", "FREE"))
        if not paid and status == "active" and previous.get("status") in REVOKED_STATUSES:
            paid_until = previous.get("paid_period_end")
            if isinstance(paid_until, datetime) and paid_until.tzinfo is None:
                paid_until = paid_until.replace(tzinfo=timezone.utc)
            # Resuming a paused subscription may restore its already-paid term.
            # Other suspended states must receive a successful payment first.
            if previous.get("status") != "paused" or not isinstance(paid_until, datetime) or paid_until <= _now():
                return {"status": "ignored"}
            access_tier = previous["paid_tier"]
        limit = tier_limits_for(access_tier).monthly_requests
        snapshot = {
            **(previous if same_subscription else {}), "tier": access_tier, "monthly_limit": limit, "status": status,
            "billing_provider": "creem", "mode": _mode(), "creem_customer_id": customer_id,
            "creem_subscription_id": subscription_id, "creem_product_id": product_id,
            "cancel_at_period_end": status == "scheduled_cancel", "event_key": event_key,
            "last_event_id": event_id, "updated_at": _now(),
        }
        for source, target in (("current_period_start_date", "current_period_start"), ("current_period_end_date", "current_period_end")):
            value = _date(sub.get(source))
            if value is not None:
                snapshot[target] = value
        transaction_id = _identifier(order.get("transaction")) or _identifier(sub.get("last_transaction_id"))
        if transaction_id:
            snapshot["creem_transaction_id"] = transaction_id
        if paid:
            snapshot["payment_confirmed"] = True
            snapshot["paid_tier"] = tier
            paid_until = _date(sub.get("current_period_end_date"))
            if paid_until is not None:
                snapshot["paid_period_end"] = paid_until
        result = await users.update_one(
            {"_id": user["_id"], "creem_billing.event_key": previous_key if previous_key is not None else {"$exists": False}},
            {"$set": {"tier": access_tier, "monthly_limit": limit, "creem_billing": snapshot, "updated_at": _now()}},
        )
        if result.matched_count:
            break
        user = await _user(database, user_id)
    else:
        raise HTTPException(503, "Billing changed concurrently; retry delivery")
    # Re-read the canonical state: a concurrent newer event may already have won.
    latest = await _user(database, user_id)
    canonical = latest["creem_billing"]
    billing = database.get_collection("billing")
    await billing.update_one({"user_id": user_id}, {"$setOnInsert": {"user_id": user_id}}, upsert=True)
    await billing.update_one(
        {"user_id": user_id, "$or": [{"event_key": {"$exists": False}}, {"event_key": {"$lte": canonical["event_key"]}}]},
        {"$set": canonical},
    )
    if request_id and (paid or status in REVOKED_STATUSES):
        await users.update_one({"_id": user["_id"], "creem_checkout_request_id": request_id},
                               {"$unset": {"creem_checkout_request_id": ""}})
    # Mark complete only after every durable write, so a failed attempt is retryable.
    try:
        await events.insert_one({"_id": event_id, "event_type": event_type, "user_id": user_id,
                                 "event_key": event_key, "status": "processed", "processed_at": _now()})
    except DuplicateKeyError:
        pass
    return {"status": "processed"}
