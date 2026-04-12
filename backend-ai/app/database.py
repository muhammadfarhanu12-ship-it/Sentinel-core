from __future__ import annotations

from app.db.mongo import (
    close_mongo_connection,
    connect_to_mongo,
    get_collection,
    get_database,
    get_mongo_connection_status,
    get_mongo_db_name,
    get_mongo_uri,
    ping_mongo,
)
from app.core.config import settings


class _CollectionProxy:
    def __init__(self, name: str):
        self._name = name

    def _resolve(self):
        return get_collection(self._name)

    def __getattr__(self, item):
        return getattr(self._resolve(), item)


MONGO_URI = settings.MONGODB_URI
MONGO_DB_NAME = settings.MONGO_DB_NAME

users_collection = _CollectionProxy("users")
auth_sessions_collection = _CollectionProxy("auth_sessions")

# Backward-compatible aliases.
client = None
database = None
db = None
user_collection = users_collection
session_collection = auth_sessions_collection
mongo_client = None
mongo_connection_state = None


__all__ = [
    "close_mongo_connection",
    "connect_to_mongo",
    "get_mongo_connection_status",
    "ping_mongo",
    "users_collection",
    "auth_sessions_collection",
    "user_collection",
    "session_collection",
]
