from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_auth_service import WebSocketIdentity, authenticate_websocket

router = APIRouter()
logger = logging.getLogger("log_ws")
WEBSOCKET_HEARTBEAT_SECONDS = 20


class ConnectionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, *, identity: WebSocketIdentity, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[identity.user_id].add(websocket)
        logger.info("Log websocket connected user_id=%s email=%s", identity.user_id, identity.email)

    async def disconnect(self, *, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    self._connections.pop(user_id, None)
        logger.info("Log websocket disconnected user_id=%s", user_id)

    async def broadcast(self, *, user_id: str, log_data: dict) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, set()))

        if not sockets:
            logger.debug("No websocket subscribers for log broadcast user_id=%s", user_id)
            return

        results = await asyncio.gather(*(ws.send_json(log_data) for ws in sockets), return_exceptions=True)
        disconnected: list[WebSocket] = []
        for websocket, result in zip(sockets, results, strict=False):
            if isinstance(result, Exception):
                logger.warning("Log websocket send failed user_id=%s error=%s", user_id, result)
                disconnected.append(websocket)

        for websocket in disconnected:
            await self.disconnect(user_id=user_id, websocket=websocket)


manager = ConnectionManager()


def schedule_broadcast(log_data: dict, *, user_id: str | None) -> None:
    if not user_id:
        logger.debug("Skipping websocket log broadcast because no user_id was supplied")
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(user_id=user_id, log_data=log_data))
        return
    except RuntimeError:
        pass

    try:
        from anyio import from_thread

        async def _schedule() -> None:
            asyncio.create_task(manager.broadcast(user_id=user_id, log_data=log_data))

        from_thread.run(_schedule)
    except Exception:
        logger.exception("Failed to schedule websocket log broadcast user_id=%s", user_id)


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket) -> None:
    auth_result = await authenticate_websocket(websocket)
    identity = auth_result.identity
    if identity is None:
        try:
            await websocket.accept()
            await websocket.close(code=auth_result.close_code, reason=auth_result.close_reason)
        except Exception:
            logger.debug("Log websocket closed before authentication rejection could be sent")
        return

    await websocket.accept()
    await manager.connect(identity=identity, websocket=websocket)
    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=WEBSOCKET_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                await websocket.send_text("ping")
                continue

            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000), message.get("reason"))
    except WebSocketDisconnect as exc:
        logger.info("Log websocket disconnected user_id=%s code=%s", identity.user_id, exc.code)
    except RuntimeError as exc:
        if "disconnect message" in str(exc).lower():
            logger.info("Log websocket disconnected user_id=%s", identity.user_id)
        else:
            logger.exception("Unexpected log websocket runtime failure user_id=%s", identity.user_id)
            try:
                await websocket.close(code=1011, reason="Internal server error")
            except Exception:
                logger.debug("Log websocket already closed user_id=%s", identity.user_id)
    except Exception:
        logger.exception("Unexpected log websocket failure user_id=%s", identity.user_id)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            logger.debug("Log websocket already closed user_id=%s", identity.user_id)
    finally:
        await manager.disconnect(user_id=identity.user_id, websocket=websocket)
