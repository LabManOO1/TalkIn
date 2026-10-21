import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..auth import get_current_user_ws
from ..database import SessionLocal
from ..models.participant import ParticipantRole
from ..models.room import Room, RoomStatus, SCREEN_SHARE_CREATOR_ONLY
from ..models.scheduled_conference import ConferenceStatus, ScheduledConference
from ..services.participant_service import ParticipantService

signal_router = APIRouter()
rooms: Dict[str, List[Dict[str, Any]]] = {}


async def send_payload(client: Dict[str, Any], payload: dict) -> bool:
    websocket = client.get("ws")
    if websocket is None:
        return False
    try:
        await websocket.send_text(json.dumps(payload))
        return True
    except Exception:
        return False


async def broadcast(
    invite_code: str,
    payload: dict,
    exclude_ws: Optional[WebSocket] = None,
    target_client_id: Optional[str] = None,
    target_user_id: Optional[str] = None,
) -> None:
    alive = []
    for client in list(rooms.get(invite_code, [])):
        client_ws = client.get("ws")
        if client_ws is None:
            continue
        if exclude_ws is not None and client_ws is exclude_ws:
            alive.append(client)
            continue
        if target_client_id is not None and str(client.get("client_id")) != str(target_client_id):
            alive.append(client)
            continue
        if target_user_id is not None and str(client.get("user_id")) != str(target_user_id):
            alive.append(client)
            continue
        if await send_payload(client, payload):
            alive.append(client)

    if alive:
        rooms[invite_code] = alive
    else:
        rooms.pop(invite_code, None)


def remove_connection(invite_code: str, websocket: WebSocket):
    remaining = [client for client in rooms.get(invite_code, []) if client.get("ws") is not websocket]
    if remaining:
        rooms[invite_code] = remaining
    else:
        rooms.pop(invite_code, None)
    return remaining


def serialize_participant(client: Dict[str, Any]) -> Dict[str, Any]:
    user_id = str(client.get("user_id"))
    client_id = client.get("client_id")
    return {
        "clientId": client_id,
        "client_id": client_id,
        "userId": user_id,
        "user_id": user_id,
        "username": client.get("username", "Участник"),
        "isMuted": bool(client.get("is_muted", False)),
        "is_muted": bool(client.get("is_muted", False)),
        "isVideoOff": bool(client.get("is_video_off", False)),
        "is_video_off": bool(client.get("is_video_off", False)),
        "isScreenSharing": bool(client.get("is_screen_sharing", False)),
        "is_screen_sharing": bool(client.get("is_screen_sharing", False)),
    }


@signal_router.websocket("/ws/signal/{invite_code}")
async def signal_endpoint(websocket: WebSocket, invite_code: str, token: Optional[str] = None):
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
        if room is None:
            await websocket.close(code=1008, reason="Комната не найдена")
            return
        if room.status != RoomStatus.active:
            await websocket.close(code=1008, reason="Конференция уже завершена")
            return
        room_id = room.id
        room_created_by = room.created_by
        camera_on_join = bool(room.camera_on_join)
        microphone_on_join = bool(room.microphone_on_join)
        allow_participant_camera = bool(room.allow_participant_camera)
        allow_participant_microphone = bool(room.allow_participant_microphone)
        screen_share_policy = room.screen_share_policy
        scheduled = db.query(ScheduledConference).filter(
            ScheduledConference.room_id == room.id,
        ).first()
        if scheduled and scheduled.status == ConferenceStatus.scheduled:
            scheduled.status = ConferenceStatus.active
            db.commit()
    finally:
        db.close()

    is_creator = room_created_by == user.id
    camera_allowed = is_creator or allow_participant_camera
    microphone_allowed = is_creator or allow_participant_microphone

    await websocket.accept()
    room_clients = rooms.setdefault(invite_code, [])
    old_connections = [client for client in room_clients if str(client.get("user_id")) == str(user.id)]
    room_clients[:] = [client for client in room_clients if str(client.get("user_id")) != str(user.id)]
    existing_participants = [serialize_participant(client) for client in room_clients]

    current_client = {
        "ws": websocket,
        "user_id": user.id,
        "username": user.username,
        "client_id": None,
        "is_muted": not (microphone_on_join and microphone_allowed),
        "is_video_off": not (camera_on_join and camera_allowed),
        "is_screen_sharing": False,
    }
    room_clients.append(current_client)

    for old_client in old_connections:
        try:
            await send_payload(old_client, {"type": "duplicate-session", "userId": str(user.id), "username": user.username})
            await old_client["ws"].close(code=4001, reason="Открыто новое подключение")
        except Exception:
            pass

    db = SessionLocal()
    try:
        ParticipantService.add_participant(
            db,
            room_id,
            user.id,
            ParticipantRole.speaker,
            is_muted=not (microphone_on_join and microphone_allowed),
            is_video_off=not (camera_on_join and camera_allowed),
            is_screen_sharing=False,
        )
    finally:
        db.close()

    await websocket.send_text(
        json.dumps(
            {
                "type": "room_state",
                "participants": existing_participants,
                "roomSettings": {
                    "cameraOnJoin": camera_on_join,
                    "microphoneOnJoin": microphone_on_join,
                    "allowParticipantCamera": allow_participant_camera,
                    "allowParticipantMicrophone": allow_participant_microphone,
                    "screenSharePolicy": screen_share_policy,
                    "createdBy": str(room_created_by),
                    "isCreator": is_creator,
                },
            }
        )
    )

    try:
        while True:
            try:
                payload = json.loads(await websocket.receive_text())
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue

            message_type = payload.get("type")
            if message_type in {"chat", "chat-message", "chat_message"}:
                continue

            incoming_client_id = payload.get("from") or payload.get("clientId") or payload.get("client_id")
            if incoming_client_id:
                current_client["client_id"] = str(incoming_client_id)
            client_id = current_client.get("client_id") or str(user.id)

            payload.update(
                {
                    "from": client_id,
                    "clientId": client_id,
                    "client_id": client_id,
                    "userId": str(user.id),
                    "user_id": str(user.id),
                    "from_user_id": str(user.id),
                    "username": user.username,
                    "from_username": user.username,
                }
            )
            target_client_id = payload.get("target") or payload.get("target_client_id")
            target_user_id = payload.get("target_user_id")
            if target_client_id is not None:
                payload["target"] = str(target_client_id)
                payload["target_client_id"] = str(target_client_id)

            if message_type == "media-status":
                requested_muted = bool(payload.get("isMuted", payload.get("is_muted", False)))
                requested_video_off = bool(payload.get("isVideoOff", payload.get("is_video_off", False)))
                requested_screen_share = bool(payload.get("isScreenSharing", payload.get("is_screen_sharing", False)))

                if not microphone_allowed and not requested_muted:
                    requested_muted = True
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "permission_denied",
                                "permission": "microphone",
                                "detail": "Организатор запретил участникам включать микрофон",
                            }
                        )
                    )

                if not camera_allowed and not requested_video_off:
                    requested_video_off = True
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "permission_denied",
                                "permission": "camera",
                                "detail": "Организатор запретил участникам включать камеру",
                            }
                        )
                    )

                if (
                    requested_screen_share
                    and screen_share_policy == SCREEN_SHARE_CREATOR_ONLY
                    and not is_creator
                ):
                    requested_screen_share = False
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "permission_denied",
                                "permission": "screen_share",
                                "detail": "Демонстрация экрана разрешена только создателю встречи",
                            }
                        )
                    )

                current_client["is_muted"] = requested_muted
                current_client["is_video_off"] = requested_video_off
                current_client["is_screen_sharing"] = requested_screen_share
                payload.update(
                    {
                        "isMuted": current_client["is_muted"],
                        "is_muted": current_client["is_muted"],
                        "isVideoOff": current_client["is_video_off"],
                        "is_video_off": current_client["is_video_off"],
                        "isScreenSharing": requested_screen_share,
                        "is_screen_sharing": requested_screen_share,
                    }
                )

                db = SessionLocal()
                try:
                    ParticipantService.update_status(
                        db,
                        room_id,
                        user.id,
                        is_muted=current_client["is_muted"],
                        is_video_off=current_client["is_video_off"],
                        is_screen_sharing=requested_screen_share,
                    )
                finally:
                    db.close()

            await broadcast(
                invite_code,
                payload,
                exclude_ws=websocket,
                target_client_id=str(target_client_id) if target_client_id is not None else None,
                target_user_id=str(target_user_id) if target_user_id is not None else None,
            )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"Ошибка WebSocket пользователя {user.username}: {exc}")
    finally:
        remaining = remove_connection(invite_code, websocket)
        if any(str(client.get("user_id")) == str(user.id) for client in remaining):
            return

        db = SessionLocal()
        try:
            ParticipantService.remove_participant(db, room_id, user.id)
        finally:
            db.close()

        client_id = current_client.get("client_id") or str(user.id)
        await broadcast(
            invite_code,
            {
                "type": "leave",
                "from": client_id,
                "clientId": client_id,
                "client_id": client_id,
                "userId": str(user.id),
                "user_id": str(user.id),
                "username": user.username,
            },
        )
