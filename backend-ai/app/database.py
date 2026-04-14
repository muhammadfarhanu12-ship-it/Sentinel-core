from __future__ import annotations

from typing import Any, Callable

from app.core.config import settings
from app.db.mongo import (
    close_mongo_connection,
    connect_to_mongo,
    get_client,
    get_collection,
    get_database,
    get_mongo_connection_status,
    get_mongo_db_name,
    get_mongo_uri,
    mongo_connection_state,
    ping_mongo,
)


class _CollectionProxy:
    def __init__(self, name: str):
        self._name = name

    def _resolve(self):
        return get_collection(self._name)

    def __getattr__(self, item):
        return getattr(self._resolve(), item)


class _ResourceProxy:
    def __init__(self, resolver: Callable[[], Any], label: str):
        self._resolver = resolver
        self._label = label

    def _resolve(self):
        return self._resolver()

    def __bool__(self) -> bool:
        return bool(mongo_connection_state.ready)

    def __getattr__(self, item):
        return getattr(self._resolve(), item)

    def __getitem__(self, item):
        return self._resolve()[item]

    def __iter__(self):
        return iter(self._resolve())

    def __repr__(self) -> str:
        state = "ready" if mongo_connection_state.ready else "not-ready"
        return f"<_ResourceProxy label={self._label!r} state={state}>"


MONGO_URI = settings.MONGODB_URI
MONGO_DB_NAME = settings.MONGO_DB_NAME

users_collection = _CollectionProxy("users")
auth_sessions_collection = _CollectionProxy("auth_sessions")

# Backward-compatible aliases.
client = _ResourceProxy(get_client, "mongo_client")
database = _ResourceProxy(get_database, "database")
db = database
user_collection = users_collection
session_collection = auth_sessions_collection
mongo_client = client


__all__ = [
    "MONGO_DB_NAME",
    "MONGO_URI",
    "close_mongo_connection",
    "connect_to_mongo",
    "database",
    "db",
    "client",
    "get_client",
    "get_collection",
    "get_database",
    "get_mongo_connection_status",
    "get_mongo_db_name",
    "get_mongo_uri",
    "mongo_client",
    "mongo_connection_state",
    "ping_mongo",
    "users_collection",
    "auth_sessions_collection",
    "user_collection",
    "session_collection",
]
