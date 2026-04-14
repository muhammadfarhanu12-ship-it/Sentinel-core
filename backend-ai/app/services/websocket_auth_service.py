from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import HTTPException, WebSocket

from app.middleware.auth_middleware import decode_token
from app.services.auth_service import get_user_by_id

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class WebSocketIdentity:
    user_id: str
    email: str
    user_document: dict


@dataclass(slots=True)
class WebSocketAuthResult:
    identity: WebSocketIdentity | None = None
    close_code: int = 1008
    close_reason: str = "Authentication required"


def _client_label(websocket: WebSocket) -> str:
    client = websocket.client
    if client is None:
        return "unknown"
    return f"{client.host}:{client.port}"


def _extract_authorization_token(websocket: WebSocket) -> str:
    authorization = (websocket.headers.get("authorization") or "").strip()
    if not authorization:
        return ""

    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()

    return authorization


def _resolve_websocket_token(websocket: WebSocket) -> str:
    query_token = (websocket.query_params.get("token") or "").strip()
    if query_token:
        return query_token
    return _extract_authorization_token(websocket)


async def authenticate_websocket(websocket: WebSocket) -> WebSocketAuthResult:
    path = websocket.url.path
    token = _resolve_websocket_token(websocket)
    if not token:
        logger.warning("WebSocket rejected path=%s client=%s reason=missing_token", path, _client_label(websocket))
        return WebSocketAuthResult(close_code=1008, close_reason="Authentication required")

    try:
        token_data = decode_token(token, expected_type="access")
        user = await get_user_by_id(str(token_data.user_id))
    except HTTPException as exc:
        logger.warning(
            "WebSocket rejected path=%s client=%s reason=invalid_token detail=%s",
            path,
            _client_label(websocket),
            exc.detail,
        )
        return WebSocketAuthResult(close_code=1008, close_reason="Invalid token")
    except Exception:
        logger.exception("WebSocket authentication crashed path=%s client=%s", path, _client_label(websocket))
        return WebSocketAuthResult(close_code=1011, close_reason="Internal server error")

    if user is None:
        logger.warning("WebSocket rejected path=%s client=%s reason=user_not_found", path, _client_label(websocket))
        return WebSocketAuthResult(close_code=1008, close_reason="Invalid token")
    if not bool(user.get("is_active", True)):
        logger.warning(
            "WebSocket rejected path=%s client=%s reason=user_inactive user_id=%s",
            path,
            _client_label(websocket),
            user.get("_id"),
        )
        return WebSocketAuthResult(close_code=1008, close_reason="User inactive")

    identity = WebSocketIdentity(
        user_id=str(user["_id"]),
        email=str(user["email"]).lower(),
        user_document=user,
    )
    logger.info(
        "WebSocket authenticated path=%s client=%s user_id=%s email=%s",
        path,
        _client_label(websocket),
        identity.user_id,
        identity.email,
    )
    return WebSocketAuthResult(identity=identity)
