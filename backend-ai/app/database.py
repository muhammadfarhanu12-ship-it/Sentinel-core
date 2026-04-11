from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from urllib.parse import quote_plus, unquote_plus, urlparse

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo.errors import PyMongoError
from pymongo.errors import OperationFailure
from pymongo import IndexModel

from app.core.config import settings

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class MongoConnectionState:
    ready: bool = False
    database_name: str = ""
    last_error: str | None = None
    last_checked_at: datetime | None = None
    last_connected_at: datetime | None = None


mongo_connection_state = MongoConnectionState()


def _resolve_database_name(mongo_uri: str) -> str:
    configured_name = str(settings.MONGO_DB_NAME or "").strip()
    if configured_name:
        return configured_name

    parsed_uri = urlparse(mongo_uri)
    database_name = parsed_uri.path.lstrip("/").strip()
    return database_name or "sentinel_dashboard"


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
        return mongo_uri
    placeholder_tokens = {"<db_password>", "%3Cdb_password%3E"}
    if any(token in mongo_uri for token in placeholder_tokens):
        raise RuntimeError(
            "MONGO_URI still contains the '<db_password>' placeholder. "
            "Replace it with the real MongoDB Atlas database user password in backend-ai/.env."
        )
    return mongo_uri


MONGO_URI = _validate_mongo_uri(_normalize_mongo_uri(str(settings.MONGO_URI or "").strip()))
if not MONGO_URI:
    raise RuntimeError("MONGO_URI is not set. Add it to backend-ai/.env before starting the server.")

MONGO_DB_NAME = _resolve_database_name(MONGO_URI)
_parsed_mongo_uri = urlparse(MONGO_URI)
_mongo_client_kwargs = {
    "serverSelectionTimeoutMS": 5000,
    "connectTimeoutMS": 5000,
    "socketTimeoutMS": 10000,
}
if _parsed_mongo_uri.scheme == "mongodb+srv":
    _mongo_client_kwargs["tlsCAFile"] = certifi.where()

mongo_client = AsyncIOMotorClient(MONGO_URI, **_mongo_client_kwargs)
database: AsyncIOMotorDatabase = mongo_client[MONGO_DB_NAME]
users_collection: AsyncIOMotorCollection = database.get_collection("users")
auth_sessions_collection: AsyncIOMotorCollection = database.get_collection("auth_sessions")

# Backwards-compatible aliases for modules that expect shorter names.
client = mongo_client
db = database
user_collection = users_collection
session_collection = auth_sessions_collection

mongo_connection_state.database_name = MONGO_DB_NAME


def _mark_mongo_ready() -> None:
    now = _utcnow()
    mongo_connection_state.ready = True
    mongo_connection_state.last_error = None
    mongo_connection_state.last_checked_at = now
    mongo_connection_state.last_connected_at = now


def _mark_mongo_error(exc: Exception) -> None:
    mongo_connection_state.ready = False
    mongo_connection_state.last_error = str(exc)
    mongo_connection_state.last_checked_at = _utcnow()


def get_mongo_connection_status() -> dict[str, object]:
    return asdict(mongo_connection_state)


async def connect_to_mongo() -> None:
    try:
        logger.info("Attempting MongoDB connection host=%s db=%s", _parsed_mongo_uri.hostname, MONGO_DB_NAME)
        await mongo_client.admin.command("ping")
        await database.command("ping")
        await users_collection.create_indexes(
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
        await auth_sessions_collection.create_indexes(
            [
                IndexModel([("jti_hash", 1)], unique=True),
                IndexModel([("user_id", 1), ("revoked_at", 1)]),
                IndexModel([("expires_at", 1)], expireAfterSeconds=0),
            ]
        )
        _mark_mongo_ready()
        logger.info("Connected to MongoDB database '%s'", MONGO_DB_NAME)
    except OperationFailure as exc:
        _mark_mongo_error(exc)
        logger.exception("MongoDB Atlas authentication failed")
        raise RuntimeError(
            "MongoDB Atlas authentication failed. Check the MONGO_URI username/password in backend-ai/.env "
            "and confirm that the Atlas database user is allowed to access this cluster."
        ) from exc
    except Exception as exc:
        _mark_mongo_error(exc)
        logger.exception("MongoDB startup check failed")
        raise


async def ping_mongo() -> None:
    try:
        await mongo_client.admin.command("ping")
        _mark_mongo_ready()
    except PyMongoError as exc:
        _mark_mongo_error(exc)
        raise


async def close_mongo_connection() -> None:
    mongo_client.close()
    mongo_connection_state.ready = False
    mongo_connection_state.last_checked_at = _utcnow()
    logger.info("MongoDB connection closed")


__all__ = [
    "MONGO_DB_NAME",
    "MONGO_URI",
    "auth_sessions_collection",
    "client",
    "close_mongo_connection",
    "connect_to_mongo",
    "database",
    "db",
    "get_mongo_connection_status",
    "mongo_client",
    "mongo_connection_state",
    "ping_mongo",
    "session_collection",
    "user_collection",
    "users_collection",
]
