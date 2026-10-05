from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.requests import Request

from app.middleware import public_rate_limiter as public_limits
from app.middleware import rate_limiter


def make_request():
    return Request({
        "type": "http", "method": "POST", "path": "/api/v1/contact",
        "headers": [(b"x-forwarded-for", b"198.51.100.99")],
        "client": ("203.0.113.10", 1234),
    })


def counter(count=1, remaining=900):
    checked_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return {
        "count": count, "checked_at": checked_at,
        "expires_at": checked_at + timedelta(seconds=remaining),
    }


@pytest.fixture
def mongo_limiter(monkeypatch):
    settings = SimpleNamespace(
        is_production=True, PUBLIC_RATE_LIMIT_BACKEND="mongo",
        PUBLIC_RATE_LIMIT_TIMEOUT_SECONDS=0.1, API_KEY_SECRET="public-limiter-unit-test-key",
    )
    collection = SimpleNamespace(find_one_and_update=AsyncMock(return_value=counter()))
    monkeypatch.setattr(public_limits, "settings", settings)
    monkeypatch.setattr(public_limits, "get_collection", lambda name, request: collection)
    return settings, collection


def hit(identifier="203.0.113.10", scope="contact:ip", limit=5):
    return asyncio.run(public_limits.check_public_rate_limit(identifier, scope, limit, 900, make_request()))


def test_client_identifier_ignores_raw_forwarded_header():
    assert public_limits.public_client_identifier(make_request()) == "203.0.113.10"


def test_mongo_consumes_attempt_atomically_and_does_not_store_identity(mongo_limiter):
    _, collection = mongo_limiter
    hit(identifier="private@example.com")
    collection.find_one_and_update.assert_awaited_once()
    query, update = collection.find_one_and_update.await_args.args
    assert len(query["_id"]) == 64
    assert "private@example.com" not in repr((query, update))
    assert collection.find_one_and_update.await_args.kwargs == {
        "upsert": True, "return_document": ReturnDocument.AFTER,
    }
    # Server time governs window reset across workers, independently of TTL cleanup.
    assert "$$NOW" in repr(update)
    assert "$expires_at" in repr(update)
    assert "$lte" in repr(update)


def test_scopes_and_identifiers_have_separate_shared_buckets(mongo_limiter):
    _, collection = mongo_limiter
    hit()
    hit(scope="auth_login:ip")
    hit(identifier="203.0.113.11")
    keys = [call.args[0]["_id"] for call in collection.find_one_and_update.await_args_list]
    assert len(set(keys)) == 3
    hit()
    assert collection.find_one_and_update.await_args.args[0]["_id"] == keys[0]


def test_limit_allows_last_attempt_then_returns_server_retry_after(mongo_limiter):
    _, collection = mongo_limiter
    collection.find_one_and_update.return_value = counter(count=5)
    hit()
    collection.find_one_and_update.return_value = counter(count=6, remaining=17.2)
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 429
    assert raised.value.headers == {"Retry-After": "18"}


def test_concurrent_attempts_use_shared_atomic_counter_and_expiry(mongo_limiter):
    _, collection = mongo_limiter
    # Simulate the results of database serialized atomic updates, including
    # requests from other workers. No read-then-write client counter is involved.
    collection.find_one_and_update.side_effect = [counter(count=value) for value in range(1, 21)]

    async def submit_concurrently():
        return await asyncio.gather(*[
            public_limits.check_public_rate_limit("shared-client", "contact:ip", 5, 900, make_request())
            for _ in range(20)
        ], return_exceptions=True)

    results = asyncio.run(submit_concurrently())
    assert sum(value is None for value in results) == 5
    assert sum(isinstance(value, HTTPException) and value.status_code == 429 for value in results) == 15
    assert collection.find_one_and_update.await_count == 20
    collection.find_one_and_update.side_effect = None
    collection.find_one_and_update.return_value = counter(count=1)
    hit(identifier="shared-client")  # Server has opened a new window, with no process reset.


def test_concurrent_first_insert_race_retries_as_atomic_update(mongo_limiter):
    _, collection = mongo_limiter
    collection.find_one_and_update.side_effect = [DuplicateKeyError("racing upsert"), counter(count=2)]
    hit()
    assert collection.find_one_and_update.await_count == 2
    assert collection.find_one_and_update.await_args.kwargs["upsert"] is False


@pytest.mark.parametrize("failure", [RuntimeError("database unavailable"), TimeoutError("timeout")])
def test_storage_failure_fails_closed_without_local_fallback(mongo_limiter, monkeypatch, failure):
    _, collection = mongo_limiter
    collection.find_one_and_update.side_effect = failure
    monkeypatch.setattr(rate_limiter, "check_rate_limit", lambda *a, **kw: pytest.fail("Production used memory fallback"))
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 503
    assert raised.value.headers == {"Retry-After": "5"}
    assert str(failure) not in raised.value.detail


def test_hung_storage_is_bounded_by_timeout(mongo_limiter):
    _, collection = mongo_limiter

    async def hang(*args, **kwargs):
        await asyncio.Event().wait()

    collection.find_one_and_update.side_effect = hang
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 503


@pytest.mark.parametrize("invalid_counter", [None, {}, counter(count=0), {**counter(), "expires_at": "invalid"}])
def test_malformed_storage_result_fails_closed(mongo_limiter, invalid_counter):
    _, collection = mongo_limiter
    collection.find_one_and_update.return_value = invalid_counter
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 503


@pytest.mark.parametrize("backend", ["memory", "disabled", ""])
def test_production_cannot_disable_shared_limiter(mongo_limiter, backend):
    settings, collection = mongo_limiter
    settings.PUBLIC_RATE_LIMIT_BACKEND = backend
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 503
    collection.find_one_and_update.assert_not_awaited()


def test_development_preserves_existing_rolling_memory_limits(mongo_limiter, monkeypatch):
    settings, collection = mongo_limiter
    settings.is_production = False
    settings.PUBLIC_RATE_LIMIT_BACKEND = "memory"
    now = [1000.0]
    monkeypatch.setattr(rate_limiter, "limiter", rate_limiter.RateLimiter())
    monkeypatch.setattr(rate_limiter, "time", SimpleNamespace(time=lambda: now[0]))
    for _ in range(5):
        hit()
    with pytest.raises(HTTPException) as raised:
        hit()
    assert raised.value.status_code == 429
    assert raised.value.headers == {"Retry-After": "900"}
    now[0] += 900
    hit()
    collection.find_one_and_update.assert_not_awaited()
