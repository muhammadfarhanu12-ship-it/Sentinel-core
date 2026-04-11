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


async def authenticate_websocket(websocket: WebSocket) -> WebSocketIdentity | None:
    path = websocket.url.path
    token = _resolve_websocket_token(websocket)
    if not token:
        logger.warning("WebSocket rejected path=%s client=%s reason=missing_token", path, _client_label(websocket))
        await websocket.close(code=1008, reason="Authentication required")
        return None

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
        await websocket.close(code=1008, reason="Invalid token")
        return None
    except Exception:
        logger.exception("WebSocket authentication crashed path=%s client=%s", path, _client_label(websocket))
        await websocket.close(code=1011, reason="Internal server error")
        return None

    if user is None:
        logger.warning("WebSocket rejected path=%s client=%s reason=user_not_found", path, _client_label(websocket))
        await websocket.close(code=1008, reason="Invalid token")
        return None
    if not bool(user.get("is_active", True)):
        logger.warning(
            "WebSocket rejected path=%s client=%s reason=user_inactive user_id=%s",
            path,
            _client_label(websocket),
            user.get("_id"),
        )
        await websocket.close(code=1008, reason="User inactive")
        return None

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
    return identity
