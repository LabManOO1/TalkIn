import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..auth import get_current_user_ws
from ..database import SessionLocal
from ..models.room import Room, RoomStatus
from ..services.chat_service import ChatService

chat_router = APIRouter()
chat_rooms: Dict[str, List[Dict[str, Any]]] = {}
MAX_MESSAGE_LENGTH = 1500


async def broadcast_chat(
    invite_code: str,
    payload: dict,
    exclude_ws: Optional[WebSocket] = None,
) -> None:
    alive = []
    for client in list(chat_rooms.get(invite_code, [])):
        websocket = client.get("ws")
        if websocket is None:
            continue
        if exclude_ws is not None and websocket is exclude_ws:
            alive.append(client)
            continue
        try:
            await websocket.send_text(json.dumps(payload))
            alive.append(client)
        except Exception:
            pass

    if alive:
        chat_rooms[invite_code] = alive
    else:
        chat_rooms.pop(invite_code, None)


@chat_router.websocket("/ws/chat/{invite_code}")
async def chat_endpoint(
    websocket: WebSocket,
    invite_code: str,
    token: Optional[str] = None,
):
    invite_code = invite_code.upper()
    if not token:
        await websocket.close(code=1008, reason="Token required")
        return

    try:
        user = await get_current_user_ws(token)
    except HTTPException:
        await websocket.close(code=1008, reason="Invalid token")
        return

    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.invite_code == invite_code).first()
        if not room:
            await websocket.close(code=1008, reason="Комната не найдена")
            return
        if room.status != RoomStatus.active:
            await websocket.close(code=1008, reason="Конференция уже завершена")
            return
        room_id = room.id
    finally:
        db.close()

    await websocket.accept()
    client = {"ws": websocket, "user_id": user.id, "username": user.username}
    chat_rooms.setdefault(invite_code, []).append(client)

    db = SessionLocal()
    try:
        history = [
            {
                "id": str(message.id),
                "user_id": str(message_user.id),
                "username": message_user.username,
                "content": message.content,
                "sent_at": message.sent_at.isoformat() if message.sent_at else None,
            }
            for message, message_user in ChatService.get_messages_with_users(db, room_id)
        ]
        await websocket.send_text(json.dumps({"type": "history", "messages": history}))
    finally:
        db.close()

    try:
        while True:
            try:
                payload = json.loads(await websocket.receive_text())
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "detail": "Некорректный JSON"}))
                continue

            if not isinstance(payload, dict):
                continue

            message_type = payload.get("type", "message")
            if message_type == "delete_message":
                try:
                    message_id = uuid.UUID(str(payload.get("message_id")))
                except (TypeError, ValueError):
                    await websocket.send_text(json.dumps({"type": "error", "detail": "Некорректный ID сообщения"}))
                    continue

                db = SessionLocal()
                try:
                    deleted = ChatService.delete_message(db, message_id, user.id)
                finally:
                    db.close()

                if not deleted:
                    await websocket.send_text(json.dumps({"type": "error", "detail": "Сообщение не найдено или не принадлежит вам"}))
                    continue

                await broadcast_chat(
                    invite_code,
                    {"type": "message_deleted", "message_id": str(message_id)},
                )
                continue

            if message_type not in {"message", "send_message"}:
                continue

            content = str(payload.get("content", "")).strip()
            if not content:
                continue
            if len(content) > MAX_MESSAGE_LENGTH:
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": f"Сообщение длиннее {MAX_MESSAGE_LENGTH} символов"})
                )
                continue

            db = SessionLocal()
            try:
                message = ChatService.save_message(db, room_id, user.id, content)
                response = {
                    "type": "message",
                    "id": str(message.id),
                    "user_id": str(user.id),
                    "username": user.username,
                    "content": message.content,
                    "sent_at": message.sent_at.isoformat() if message.sent_at else None,
                }
            finally:
                db.close()
            await broadcast_chat(invite_code, response)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"Ошибка WebSocket чата: {exc}")
    finally:
        clients = [item for item in chat_rooms.get(invite_code, []) if item.get("ws") is not websocket]
        if clients:
            chat_rooms[invite_code] = clients
        else:
            chat_rooms.pop(invite_code, None)
