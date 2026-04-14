from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from urllib.parse import quote_plus, unquote_plus, urlparse

from fastapi import HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo import IndexModel
from pymongo.errors import OperationFailure, PyMongoError

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class MongoConnectionState:
    ready: bool = False
    database_name: str = ""
    last_error: str | None = None
    last_checked_at: datetime | None = None
    last_connected_at: datetime | None = None


mongo_connection_state = MongoConnectionState()
_mongo_client: AsyncIOMotorClient | None = None
_database: AsyncIOMotorDatabase | None = None
_mongo_uri: str = ""
_mongo_db_name: str = ""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_mongo_uri(mongo_uri: str) -> str:
    if "://" not in mongo_uri:
        return mongo_uri

    scheme, remainder = mongo_uri.split("://", 1)
    authority, separator, tail = remainder.partition("/")
    if "@" not in authority or ":" not in authority:
        return mongo_uri

    userinfo, hostinfo = authority.rsplit("@", 1)
    if ":" not in userinfo:
        return mongo_uri

    username, password = userinfo.split(":", 1)
    normalized_userinfo = f"{quote_plus(unquote_plus(username))}:{quote_plus(unquote_plus(password))}"
    normalized_remainder = f"{normalized_userinfo}@{hostinfo}"
    if separator:
        normalized_remainder = f"{normalized_remainder}/{tail}"
    return f"{scheme}://{normalized_remainder}"


def _validate_mongo_uri(mongo_uri: str) -> str:
    if not mongo_uri:
        raise RuntimeError("MONGODB_URI is not set. Add it to backend-ai/.env before starting the server.")

    placeholder_tokens = {"<db_password>", "%3Cdb_password%3E"}
    if any(token in mongo_uri for token in placeholder_tokens):
        raise RuntimeError(
            "MONGODB_URI still contains the '<db_password>' placeholder. "
            "Replace it with the real MongoDB Atlas database user password in backend-ai/.env."
        )

    return mongo_uri


def _resolve_mongo_uri() -> str:
    configured = str(settings.MONGODB_URI or settings.MONGO_URI or "").strip()
    return _validate_mongo_uri(_normalize_mongo_uri(configured))


def _resolve_database_name(mongo_uri: str) -> str:
    configured_name = str(settings.MONGO_DB_NAME or "").strip()
    if configured_name:
        return configured_name

    parsed_uri = urlparse(mongo_uri)
    database_name = parsed_uri.path.lstrip("/").strip()
    return database_name or "sentinel_dashboard"


def _mark_ready() -> None:
    now = _utcnow()
    mongo_connection_state.ready = True
    mongo_connection_state.last_error = None
    mongo_connection_state.last_checked_at = now
    mongo_connection_state.last_connected_at = now
    mongo_connection_state.database_name = _mongo_db_name


def _mark_error(exc: Exception) -> None:
    mongo_connection_state.ready = False
    mongo_connection_state.last_error = str(exc)
    mongo_connection_state.last_checked_at = _utcnow()
    mongo_connection_state.database_name = _mongo_db_name


def get_mongo_connection_status() -> dict[str, object]:
    return asdict(mongo_connection_state)


def get_mongo_uri() -> str:
    return _mongo_uri


def get_mongo_db_name() -> str:
    return _mongo_db_name


def get_client() -> AsyncIOMotorClient:
    if _mongo_client is None:
        raise RuntimeError("MongoDB client is not initialized. Ensure connect_to_mongo() ran during startup.")
    return _mongo_client


def get_database() -> AsyncIOMotorDatabase:
    if _database is None:
        raise RuntimeError("MongoDB database is not initialized. Ensure connect_to_mongo() ran during startup.")
    return _database


def get_database_from_request(request: Request) -> AsyncIOMotorDatabase:
    database = getattr(request.app.state, "database", None)
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not ready. Please retry shortly.",
        )
    return database


def get_collection(name: str, *, request: Request | None = None) -> AsyncIOMotorCollection:
    database = get_database_from_request(request) if request is not None else get_database()
    return database.get_collection(name)


async def connect_to_mongo(*, app=None) -> None:
    global _mongo_client, _database, _mongo_uri, _mongo_db_name

    if _mongo_client is not None and _database is not None:
        if app is not None:
            app.state.mongodb_client = _mongo_client
            app.state.database = _database
            app.state.mongo_connection_state = mongo_connection_state
        return

    _mongo_uri = _resolve_mongo_uri()
    _mongo_db_name = _resolve_database_name(_mongo_uri)

    parsed = urlparse(_mongo_uri)
    client_kwargs: dict[str, object] = {
        "serverSelectionTimeoutMS": 5000,
        "connectTimeoutMS": 5000,
        "socketTimeoutMS": 10000,
    }

    client = AsyncIOMotorClient(_mongo_uri, **client_kwargs)
    database = client[_mongo_db_name]

    try:
        logger.info("Attempting MongoDB connection host=%s db=%s", parsed.hostname, _mongo_db_name)
        await client.admin.command("ping")
        await database.command("ping")

        await database.get_collection("users").create_indexes(
            [
                IndexModel([("email", 1)], unique=True),
                IndexModel([("role", 1)]),
                IndexModel([("verification_token_hash", 1)]),
                IndexModel([("verify_token_hash", 1)]),
                IndexModel([("verification_token", 1)]),
                IndexModel([("verify_token", 1)]),
                IndexModel([("last_verification_token_hash", 1)]),
                IndexModel([("last_verify_token_hash", 1)]),
                IndexModel([("reset_token_hash", 1)]),
            ]
        )
        await database.get_collection("auth_sessions").create_indexes(
            [
                IndexModel([("jti_hash", 1)], unique=True),
                IndexModel([("user_id", 1), ("revoked_at", 1)]),
                IndexModel([("expires_at", 1)], expireAfterSeconds=0),
            ]
        )

        _mongo_client = client
        _database = database

        if app is not None:
            app.state.mongodb_client = client
            app.state.database = database
            app.state.mongo_connection_state = mongo_connection_state

        _mark_ready()
        logger.info("Connected to MongoDB database '%s'", _mongo_db_name)
    except OperationFailure as exc:
        _mark_error(exc)
        client.close()
        raise RuntimeError(
            "MongoDB Atlas authentication failed. Check MONGODB_URI credentials in backend-ai/.env."
        ) from exc
    except Exception as exc:
        _mark_error(exc)
        client.close()
        raise


async def ping_mongo() -> None:
    try:
        await get_client().admin.command("ping")
        _mark_ready()
    except PyMongoError as exc:
        _mark_error(exc)
        raise


async def close_mongo_connection(*, app=None) -> None:
    global _mongo_client, _database

    if _mongo_client is not None:
        _mongo_client.close()

    _mongo_client = None
    _database = None
    mongo_connection_state.ready = False
    mongo_connection_state.last_checked_at = _utcnow()

    if app is not None:
        app.state.mongodb_client = None
        app.state.database = None
        app.state.mongo_connection_state = mongo_connection_state

    logger.info("MongoDB connection closed")


__all__ = [
    "close_mongo_connection",
    "connect_to_mongo",
    "get_client",
    "get_collection",
    "get_database",
    "get_database_from_request",
    "get_mongo_connection_status",
    "get_mongo_db_name",
    "get_mongo_uri",
    "mongo_connection_state",
    "ping_mongo",
]
