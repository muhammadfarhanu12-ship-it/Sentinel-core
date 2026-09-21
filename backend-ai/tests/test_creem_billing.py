from __future__ import annotations

import asyncio
import copy
import hashlib
import hmac
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.tier import tier_limits_for
from app.services import creem_service

HTTPX_ASYNC_CLIENT = httpx.AsyncClient


class MemoryCollection:
    """Small Mongo fake that honors conditional updates and unique event IDs."""

    def __init__(self):
        self.documents: list[dict] = []

    @staticmethod
    def field_value(document, field):
        value = document
        for part in field.split("."):
            if not isinstance(value, dict) or part not in value:
                return None, False
            value = value[part]
        return value, True

    @classmethod
    def matches(cls, document: dict, query: dict) -> bool:
        for field, expected in query.items():
            if field == "$or":
                if not any(cls.matches(document, clause) for clause in expected):
                    return False
                continue
            if field == "$and":
                if not all(cls.matches(document, clause) for clause in expected):
                    return False
                continue
            actual, exists = cls.field_value(document, field)
            if not isinstance(expected, dict):
                if actual != expected:
                    return False
                continue
            for operator, value in expected.items():
                if operator == "$exists":
                    matched = exists == value
                elif operator == "$lt":
                    matched = actual is not None and actual < value
                elif operator == "$lte":
                    matched = actual is not None and actual <= value
                elif operator == "$ne":
                    matched = actual != value
                elif operator == "$in":
                    matched = actual in value
                elif operator == "$nin":
                    matched = actual not in value
                else:
                    raise AssertionError(f"Unsupported Mongo operator in test: {operator}")
                if not matched:
                    return False
        return True

    async def find_one(self, query, *_args, **_kwargs):
        return next((copy.deepcopy(row) for row in self.documents if self.matches(row, query)), None)

    async def insert_one(self, document):
        row = copy.deepcopy(document)
        row.setdefault("_id", ObjectId())
        if any(existing["_id"] == row["_id"] for existing in self.documents):
            raise DuplicateKeyError("duplicate _id")
        self.documents.append(row)
        return SimpleNamespace(inserted_id=row["_id"])

    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.documents if self.matches(row, query)), None)
        inserted = row is None
        if inserted:
            if not upsert:
                return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)
            row = {key: value for key, value in query.items() if not key.startswith("$") and not isinstance(value, dict)}
            row.update(copy.deepcopy(update.get("$setOnInsert", {})))
            result = await self.insert_one(row)
            row = next(item for item in self.documents if item["_id"] == result.inserted_id)
        row.update(copy.deepcopy(update.get("$set", {})))
        for key in update.get("$unset", {}):
            row.pop(key, None)
        for key, value in update.get("$inc", {}).items():
            row[key] = row.get(key, 0) + value
        return SimpleNamespace(matched_count=int(not inserted), modified_count=int(not inserted), upserted_id=row["_id"] if inserted else None)

    async def delete_one(self, query):
        row = next((row for row in self.documents if self.matches(row, query)), None)
        if row is not None:
            self.documents.remove(row)
        return SimpleNamespace(deleted_count=int(row is not None))


class MemoryDatabase:
    def __init__(self):
        self.collections: dict[str, MemoryCollection] = {}

    def get_collection(self, name):
        return self.collections.setdefault(name, MemoryCollection())

    def __getitem__(self, name):
        return self.get_collection(name)


@pytest.fixture
def billing_context(monkeypatch):
    for name, value in {
        "CREEM_API_KEY": "creem_test_local",
        "CREEM_WEBHOOK_SECRET": "local-webhook-secret",
        "CREEM_PRODUCT_ID_PRO": "prod_pro",
        "CREEM_PRODUCT_ID_BUSINESS": "prod_business",
        "CREEM_TEST_MODE": True,
        "FRONTEND_URL": "https://app.example.test",
    }.items():
        monkeypatch.setattr(settings, name, value)
    database = MemoryDatabase()
    user = {"_id": ObjectId(), "email": "buyer@example.test", "tier": "FREE", "monthly_limit": tier_limits_for("FREE").monthly_requests}
    database["users"].documents.append(copy.deepcopy(user))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(database=database)))
    return request, user, database


def signed(body: bytes) -> str:
    return hmac.new(settings.CREEM_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_webhook_signature_verifies_the_original_bytes(billing_context):
    body = b'{"eventType": "checkout.completed", "id": "evt_1"}'
    creem_service.verify_webhook_signature(body, signed(body))
    with pytest.raises(HTTPException) as exc:
        creem_service.verify_webhook_signature(body.replace(b"evt_1", b"evt_2"), signed(body))
    assert exc.value.status_code in {400, 401}


@pytest.mark.parametrize("signature", [None, "", "not-a-signature", "f" * 63, "f" * 65, "\N{LATIN SMALL LETTER E WITH ACUTE}" * 64])
def test_webhook_signature_rejects_missing_or_malformed_values(billing_context, signature):
    with pytest.raises(HTTPException) as exc:
        creem_service.verify_webhook_signature(b"{}", signature)
    assert exc.value.status_code in {400, 401}


def test_webhook_without_a_signing_secret_is_unavailable(billing_context, monkeypatch):
    monkeypatch.setattr(settings, "CREEM_WEBHOOK_SECRET", "")
    with pytest.raises(HTTPException) as exc:
        creem_service.verify_webhook_signature(b"{}", "0" * 64)
    assert exc.value.status_code == 503


def mock_checkout_provider(monkeypatch, *, response_status=200, response_body=None, transport_error=False):
    calls = []

    def respond(request):
        calls.append(request)
        if transport_error:
            raise httpx.ConnectError("provider unavailable", request=request)
        return httpx.Response(
            response_status,
            json=response_body if response_body is not None else {
                "id": "ch_local",
                "status": "pending",
                "checkout_url": "https://www.creem.io/test/payment/ch_local",
            },
        )

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(respond)
        return HTTPX_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(creem_service.httpx, "AsyncClient", client_factory)
    return calls


def start_checkout(context, monkeypatch, plan="PRO"):
    request, user, database = context
    calls = mock_checkout_provider(monkeypatch)
    response = asyncio.run(creem_service.create_checkout_session(request, user, plan_name=plan))
    checkout_payload = json.loads(calls[-1].content)
    return response, checkout_payload


@pytest.mark.parametrize("test_mode,api_host", [(True, "test-api.creem.io"), (False, "api.creem.io")])
def test_checkout_calls_creem_without_changing_user_entitlements(billing_context, monkeypatch, test_mode, api_host):
    request, user, database = billing_context
    monkeypatch.setattr(settings, "CREEM_TEST_MODE", test_mode)
    calls = mock_checkout_provider(monkeypatch)
    response = asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    assert len(calls) == 1
    assert str(calls[0].url) == f"https://{api_host}/v1/checkouts"
    assert calls[0].headers["x-api-key"] == "creem_test_local"
    payload = json.loads(calls[0].content)
    assert payload["product_id"] == "prod_pro"
    assert payload["customer"] == {"email": "buyer@example.test"}
    assert payload["metadata"]["user_id"] == str(user["_id"])
    assert payload["metadata"]["target_tier"] == "PRO"
    assert payload["success_url"].startswith("https://app.example.test/")
    assert response["checkout_url"] == "https://www.creem.io/test/payment/ch_local"
    assert database["users"].documents[0]["tier"] == "FREE"
    assert database["users"].documents[0]["monthly_limit"] == tier_limits_for("FREE").monthly_requests
    stored = asyncio.run(database["billing_checkouts"].find_one({"_id": payload["request_id"]}))
    assert stored is not None
    assert stored["user_id"] == str(user["_id"])
    assert stored["product_id"] == "prod_pro"


@pytest.mark.parametrize("missing_setting", ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_PRODUCT_ID_PRO"])
def test_incomplete_checkout_configuration_fails_closed(billing_context, monkeypatch, missing_setting):
    request, user, database = billing_context
    monkeypatch.setattr(settings, missing_setting, "")
    calls = mock_checkout_provider(monkeypatch)
    response = asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    assert response["status"] == "payment_not_configured"
    assert calls == []
    assert database["users"].documents[0]["tier"] == "FREE"


@pytest.mark.parametrize("provider_options", [
    {"response_status": 401, "response_body": {"message": "private provider error"}},
    {"response_status": 500},
    {"transport_error": True},
    {"response_body": {"id": "ch_local", "status": "pending"}},
    {"response_body": {"id": "ch_local", "checkout_url": "javascript:alert(1)"}},
])
def test_provider_failures_never_activate_a_paid_plan(billing_context, monkeypatch, provider_options):
    request, user, database = billing_context
    mock_checkout_provider(monkeypatch, **provider_options)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    assert exc.value.status_code in {502, 503, 504}
    assert "private provider error" not in str(exc.value.detail)
    assert database["users"].documents[0]["tier"] == "FREE"


def checkout_event(payload, *, event_id="evt_paid", created_at=1770000000000):
    return {
        "id": event_id,
        "eventType": "checkout.completed",
        "created_at": created_at,
        "object": {
            "id": "ch_local",
            "mode": "test",
            "status": "completed",
            "request_id": payload["request_id"],
            "metadata": copy.deepcopy(payload["metadata"]),
            "product": {"id": payload["product_id"]},
            "customer": {"id": "cust_local", "email": "buyer@example.test"},
            "subscription": {"id": "sub_local", "status": "active"},
            "order": {"id": "ord_local", "status": "paid", "transaction": "tran_local"},
        },
    }


def subscription_event(event_type, *, event_id="evt_subscription", created_at=1770000001000, product_id="prod_pro"):
    return {
        "id": event_id,
        "eventType": event_type,
        "created_at": created_at,
        "object": {
            "id": "sub_local",
            "mode": "test",
            "status": event_type.split(".")[-1],
            "product": {"id": product_id},
            "customer": {"id": "cust_local", "email": "buyer@example.test"},
            "current_period_start_date": "2026-02-02T00:00:00Z",
            "current_period_end_date": "2026-03-02T00:00:00Z",
        },
    }


def test_verified_paid_checkout_grants_the_mapped_tier_and_persists_provider_ids(billing_context, monkeypatch):
    request, user, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    asyncio.run(creem_service.process_webhook(request, event))
    saved_user = database["users"].documents[0]
    assert saved_user["tier"] == "PRO"
    assert saved_user["monthly_limit"] == tier_limits_for("PRO").monthly_requests
    billing = asyncio.run(database["billing"].find_one({"user_id": str(user["_id"])}))
    assert billing["creem_customer_id"] == "cust_local"
    assert billing["creem_subscription_id"] == "sub_local"
    event_record = asyncio.run(database["billing_webhook_events"].find_one({"_id": event["id"]}))
    assert event_record["status"] == "processed"


def test_duplicate_paid_event_does_not_change_state_twice(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    asyncio.run(creem_service.process_webhook(request, event))
    user_before = copy.deepcopy(database["users"].documents)
    billing_before = copy.deepcopy(database["billing"].documents)
    asyncio.run(creem_service.process_webhook(request, event))
    assert database["users"].documents == user_before
    assert database["billing"].documents == billing_before
    assert len(database["billing_webhook_events"].documents) == 1


@pytest.mark.parametrize("order_status", ["pending", "processing", "failed", "refunded"])
def test_completed_checkout_without_paid_order_never_grants_access(billing_context, monkeypatch, order_status):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    event["object"]["order"]["status"] = order_status
    result = asyncio.run(creem_service.process_webhook(request, event))
    assert result["status"] == "ignored"
    assert database["users"].documents[0]["tier"] == "FREE"


@pytest.mark.parametrize("mutation", ["unknown_product", "wrong_user", "unknown_checkout", "wrong_environment"])
def test_webhook_must_match_the_trusted_checkout(billing_context, monkeypatch, mutation):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    if mutation == "unknown_product":
        event["object"]["product"]["id"] = "prod_unconfigured"
    elif mutation == "wrong_user":
        event["object"]["metadata"]["user_id"] = str(ObjectId())
    elif mutation == "unknown_checkout":
        event["object"]["request_id"] = "not-a-local-checkout"
    else:
        event["object"]["mode"] = "prod"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.process_webhook(request, event))
    assert exc.value.status_code == 400
    assert database["users"].documents[0]["tier"] == "FREE"
    assert database["billing_webhook_events"].documents == []


def test_product_mapping_controls_access_instead_of_target_tier_metadata(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    event["object"]["metadata"]["target_tier"] = "BUSINESS"
    asyncio.run(creem_service.process_webhook(request, event))
    assert database["users"].documents[0]["tier"] == "PRO"


def test_subscription_active_without_payment_does_not_grant_access(billing_context):
    request, _, database = billing_context
    result = asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.active")))
    assert result["status"] == "ignored"
    assert database["users"].documents[0]["tier"] == "FREE"


def test_subscription_paid_can_arrive_before_checkout_completed(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = subscription_event("subscription.paid")
    event["object"]["metadata"] = copy.deepcopy(payload["metadata"])
    asyncio.run(creem_service.process_webhook(request, event))
    assert database["users"].documents[0]["tier"] == "PRO"
    assert database["users"].documents[0]["creem_billing"]["current_period_end"].isoformat() == "2026-03-02T00:00:00+00:00"


@pytest.mark.parametrize("status", ["canceled", "expired", "unpaid", "paused"])
def test_terminal_or_nonpaying_subscription_revokes_paid_access(billing_context, monkeypatch, status):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event(f"subscription.{status}")))
    saved = database["users"].documents[0]
    assert saved["tier"] == "FREE"
    assert saved["monthly_limit"] == tier_limits_for("FREE").monthly_requests
    assert saved["creem_billing"]["status"] == status


@pytest.mark.parametrize("status", ["past_due", "scheduled_cancel"])
def test_grace_or_scheduled_cancellation_keeps_access_until_termination(billing_context, monkeypatch, status):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event(f"subscription.{status}")))
    saved = database["users"].documents[0]
    assert saved["tier"] == "PRO"
    assert saved["creem_billing"]["status"] == status
    assert saved["creem_billing"]["cancel_at_period_end"] is (status == "scheduled_cancel")


def test_old_payment_cannot_reactivate_a_canceled_subscription(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.canceled", created_at=1770000002000)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.paid", event_id="evt_old_payment", created_at=1770000001000)))
    assert database["users"].documents[0]["tier"] == "FREE"
    assert database["billing"].documents[0]["status"] == "canceled"


def test_old_cancellation_cannot_revoke_a_newer_paid_renewal(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.paid", created_at=1770000002000)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.canceled", event_id="evt_old_cancel", created_at=1770000001000)))
    assert database["users"].documents[0]["tier"] == "PRO"
    assert database["billing"].documents[0]["status"] == "active"


def test_partial_database_failure_is_retried_before_event_is_marked_processed(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    event = checkout_event(payload)
    billing_collection = database["billing"]
    original_update = billing_collection.update_one
    monkeypatch.setattr(billing_collection, "update_one", AsyncMock(side_effect=RuntimeError("temporary database error")))
    with pytest.raises(RuntimeError, match="temporary database error"):
        asyncio.run(creem_service.process_webhook(request, event))
    assert database["billing_webhook_events"].documents == []
    monkeypatch.setattr(billing_collection, "update_one", original_update)
    asyncio.run(creem_service.process_webhook(request, event))
    assert database["users"].documents[0]["tier"] == "PRO"
    assert database["billing"].documents[0]["tier"] == "PRO"
    assert database["billing_webhook_events"].documents[0]["status"] == "processed"


def test_active_status_before_payment_does_not_suppress_payment_at_the_same_timestamp(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    active_event = subscription_event("subscription.active", created_at=1770000000000)
    active_event["object"]["metadata"] = copy.deepcopy(payload["metadata"])
    asyncio.run(creem_service.process_webhook(request, active_event))
    assert database["users"].documents[0]["tier"] == "FREE"
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload, created_at=1770000000000)))
    assert database["users"].documents[0]["tier"] == "PRO"


def test_retry_reuses_an_existing_pending_checkout(billing_context, monkeypatch):
    request, user, database = billing_context
    calls = mock_checkout_provider(monkeypatch)
    first = asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    second = asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    assert second["checkout_url"] == first["checkout_url"]
    assert second["checkout_id"] == first["checkout_id"]
    assert [call.method for call in calls] == ["POST", "GET"]
    assert calls[1].url.params["checkout_id"] == "ch_local"
    assert len(database["billing_checkouts"].documents) == 1
    assert database["users"].documents[0]["tier"] == "FREE"


def test_a_live_subscription_cannot_start_a_second_subscription(billing_context, monkeypatch):
    request, user, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    calls = mock_checkout_provider(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.create_checkout_session(request, user, plan_name="BUSINESS"))
    assert exc.value.status_code == 409
    assert calls == []
    assert database["users"].documents[0]["tier"] == "PRO"


def test_free_plan_requests_provider_cancellation_and_waits_for_termination_webhook(billing_context, monkeypatch):
    request, user, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    calls = mock_checkout_provider(monkeypatch)
    response = asyncio.run(creem_service.create_checkout_session(request, user, plan_name="FREE"))
    assert response["status"] == "cancellation_scheduled"
    assert str(calls[0].url) == "https://test-api.creem.io/v1/subscriptions/sub_local/cancel"
    assert json.loads(calls[0].content)["mode"] == "scheduled"
    assert database["users"].documents[0]["tier"] == "PRO"
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.scheduled_cancel")))
    assert database["users"].documents[0]["tier"] == "PRO"
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.canceled", event_id="evt_terminated", created_at=1770000002000)))
    assert database["users"].documents[0]["tier"] == "FREE"


def test_paid_checkout_requires_a_durable_database(billing_context, monkeypatch):
    request, user, _ = billing_context
    request.app.state.database = None
    calls = mock_checkout_provider(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.create_checkout_session(request, user, plan_name="PRO"))
    assert exc.value.status_code == 503
    assert calls == []


def test_expired_subscription_cannot_open_a_second_recurring_checkout(billing_context, monkeypatch):
    request, user, _ = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.expired")))
    calls = mock_checkout_provider(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.create_checkout_session(request, user, plan_name="BUSINESS"))
    assert exc.value.status_code == 409
    assert calls == []


def test_free_switch_removes_legacy_unpaid_entitlements(billing_context):
    request, user, database = billing_context
    database["users"].documents[0].update(tier="BUSINESS", monthly_limit=250000)
    asyncio.run(creem_service.create_checkout_session(request, user, plan_name="FREE"))
    saved = database["users"].documents[0]
    assert saved["tier"] == "FREE"
    assert saved["monthly_limit"] == tier_limits_for("FREE").monthly_requests


def test_resubscription_status_before_payment_does_not_suppress_activation(billing_context, monkeypatch):
    request, _, database = billing_context
    _, original = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(original)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.canceled")))
    _, replacement = start_checkout(billing_context, monkeypatch)
    assert replacement["customer"] == {"id": "cust_local"}
    scheduled = subscription_event("subscription.scheduled_cancel", event_id="evt_new_scheduled", created_at=1770000003000)
    scheduled["object"]["id"] = "sub_replacement"
    scheduled["object"]["metadata"] = replacement["metadata"]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.process_webhook(request, scheduled))
    assert exc.value.status_code == 409
    paid = checkout_event(replacement, event_id="evt_new_paid", created_at=1770000002000)
    paid["object"]["subscription"]["id"] = "sub_replacement"
    asyncio.run(creem_service.process_webhook(request, paid))
    asyncio.run(creem_service.process_webhook(request, scheduled))
    assert database["users"].documents[0]["tier"] == "PRO"
    assert database["users"].documents[0]["creem_billing"]["cancel_at_period_end"] is True


def test_resume_clears_scheduled_cancellation_without_a_new_checkout(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.scheduled_cancel")))
    resumed = subscription_event("subscription.update", event_id="evt_resume", created_at=1770000002000)
    resumed["object"]["status"] = "active"
    asyncio.run(creem_service.process_webhook(request, resumed))
    saved = database["users"].documents[0]
    assert saved["tier"] == "PRO"
    assert saved["creem_billing"]["status"] == "active"
    assert saved["creem_billing"]["cancel_at_period_end"] is False


@pytest.mark.parametrize("now,expected_tier", [("2026-02-20", "PRO"), ("2026-03-03", "FREE")])
def test_resume_paused_subscription_requires_an_already_paid_term(billing_context, monkeypatch, now, expected_tier):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    paid = subscription_event("subscription.paid", created_at=1770000000000)
    paid["object"]["metadata"] = payload["metadata"]
    asyncio.run(creem_service.process_webhook(request, paid))
    asyncio.run(creem_service.process_webhook(request, subscription_event("subscription.paused", event_id="evt_paused")))
    monkeypatch.setattr(creem_service, "_now", lambda: datetime.fromisoformat(now).replace(tzinfo=timezone.utc))
    resumed = subscription_event("subscription.active", event_id="evt_resume", created_at=1770000002000)
    asyncio.run(creem_service.process_webhook(request, resumed))
    assert database["users"].documents[0]["tier"] == expected_tier


def test_status_only_upgrade_waits_for_its_payment_webhook(billing_context, monkeypatch):
    request, _, database = billing_context
    _, payload = start_checkout(billing_context, monkeypatch)
    asyncio.run(creem_service.process_webhook(request, checkout_event(payload)))
    updated = subscription_event("subscription.update", created_at=1770000003000, product_id="prod_business")
    updated["object"]["status"] = "active"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(creem_service.process_webhook(request, updated))
    assert exc.value.status_code == 409
    assert database["users"].documents[0]["tier"] == "PRO"
    paid = subscription_event("subscription.paid", event_id="evt_upgrade_paid", created_at=1770000002000, product_id="prod_business")
    asyncio.run(creem_service.process_webhook(request, paid))
    asyncio.run(creem_service.process_webhook(request, updated))
    assert database["users"].documents[0]["tier"] == "BUSINESS"


def test_legacy_billing_projection_cannot_claim_an_unpaid_plan(billing_context):
    from app.services.dashboard_service import get_subscription

    request, user, database = billing_context
    database["billing"].documents.append({"user_id": str(user["_id"]), "tier": "BUSINESS", "monthly_limit": 250000})
    response = asyncio.run(get_subscription(request, user))
    assert response["tier"] == "FREE"
    assert response["monthly_limit"] == tier_limits_for("FREE").monthly_requests


@pytest.fixture
def webhook_client(billing_context, monkeypatch):
    from app.routers import billing_router

    app = FastAPI()
    app.include_router(billing_router.router, prefix="/api/v1/billing")
    handler = AsyncMock(return_value={"status": "processed"})
    monkeypatch.setattr(billing_router, "process_webhook", handler)
    with TestClient(app) as client:
        yield client, handler


def test_webhook_route_accepts_signed_original_bytes_without_login(webhook_client):
    client, handler = webhook_client
    body = b'{\n "eventType" : "checkout.completed", "id" : "evt_signed"\n}'
    response = client.post("/api/v1/billing/webhooks/creem", content=body, headers={"creem-signature": signed(body)})
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "processed"
    handler.assert_awaited_once()
    assert handler.await_args.args[1] == json.loads(body)


@pytest.mark.parametrize("headers", [{}, {"creem-signature": "0" * 64}])
def test_webhook_route_rejects_unsigned_input_before_parsing_or_processing(webhook_client, headers):
    client, handler = webhook_client
    response = client.post("/api/v1/billing/webhooks/creem", content=b"not even json", headers=headers)
    assert response.status_code == 401
    handler.assert_not_awaited()


@pytest.mark.parametrize("body", [b"not json", b"[]", b"null", b'"a string"'])
def test_webhook_route_rejects_signed_invalid_event_json(webhook_client, body):
    client, handler = webhook_client
    response = client.post("/api/v1/billing/webhooks/creem", content=body, headers={"creem-signature": signed(body)})
    assert response.status_code == 400
    handler.assert_not_awaited()
