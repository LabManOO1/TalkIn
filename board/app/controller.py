import json
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from .auth import AccessDenied
from .domain import BoardEvent
from .session_manager import SessionManager


class BoardController:
    def __init__(self, sessions: SessionManager) -> None:
        self.sessions = sessions
        self._sockets: dict[UUID, set[WebSocket]] = {}

    async def accept(self, websocket: WebSocket, invite_code: str, token: str) -> None:
        await websocket.accept()
        session = None
        try:
            session, snapshot = await self.sessions.join(invite_code, token)
        except AccessDenied as exc:
            await websocket.send_json({"type": "error", "detail": exc.detail})
            await websocket.close(code=1008)
            return
        except Exception:
            await websocket.send_json({"type": "error", "detail": "Не удалось проверить доступ"})
            await websocket.close(code=1011)
            return

        self._sockets.setdefault(session.room_id, set()).add(websocket)
        await websocket.send_json(
            {
                "type": "joined",
                "session_id": str(session.id),
                "user_id": str(session.user_id),
                "username": session.username,
                "can_write": session.can_write,
                "online": self.sessions.online(session.room_id),
                "snapshot": snapshot.to_public(),
            }
        )
        try:
            while True:
                raw = await websocket.receive_text()
                await self.route(websocket, session.id, raw)
        except WebSocketDisconnect:
            pass
        finally:
            await self._disconnect(session.id, websocket)

    async def route(self, websocket: WebSocket, session_id: UUID, raw: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send_json({"type": "error", "detail": "Некорректный JSON"})
            return

        event_type = str(message.get("type") or "")
        payload = message.get("payload") or {}
        if not isinstance(payload, dict):
            await websocket.send_json({"type": "error", "detail": "payload должен быть объектом"})
            return
        try:
            base_revision = message.get("base_revision")
            revision = int(base_revision) if base_revision is not None else None
        except (TypeError, ValueError):
            await websocket.send_json({"type": "error", "detail": "Некорректная ревизия"})
            return
        event = BoardEvent(
            type=event_type,
            room_id=session.room_id,
            user_id=session.user_id,
            payload=payload,
            base_revision=revision,
        )
        try:
            result = self.sessions.submit(session, event)
        except AccessDenied as exc:
            await websocket.send_json({"type": "error", "detail": exc.detail})
            return
        except ValueError as exc:
            await websocket.send_json({"type": "error", "detail": str(exc)})
            return
        if result.conflict:
            await websocket.send_json(
                {
                    "type": "conflict",
                    "detail": "Доска уже изменена",
                    "snapshot": result.snapshot.to_public(),
                }
            )
            return

        await self._broadcast(
            session.room_id,
            {
                "type": event.type,
                "user_id": str(session.user_id),
                "username": session.username,
                "payload": payload,
                "snapshot": result.snapshot.to_public(),
            },
        )

    async def _disconnect(self, session_id: UUID, websocket: WebSocket) -> None:
        session = self.sessions.leave(session_id)
        if session is None:
            return
        sockets = self._sockets.get(session.room_id)
        if sockets is not None:
            sockets.discard(websocket)
        event = BoardEvent(
            type="cursor",
            room_id=session.room_id,
            user_id=session.user_id,
            payload={"remove": True},
        )
        result = self.sessions.submit(session, event)
        await self._broadcast(
            session.room_id,
            {
                "type": "cursor",
                "user_id": str(session.user_id),
                "payload": {"remove": True},
                "snapshot": result.snapshot.to_public(),
            },
        )

    async def _broadcast(self, room_id: UUID, message: dict) -> None:
        dead: list[WebSocket] = []
        for socket in list(self._sockets.get(room_id, set())):
            try:
                await socket.send_json(message)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self._sockets.get(room_id, set()).discard(socket)
