import json
import uuid
import random
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db, SessionLocal
from ..models.participant import RoomParticipant
from ..models.scheduled_conference import ConferenceStatus, ScheduledConference
from ..models.room import (
    Room,
    RoomStatus,
    SCREEN_SHARE_CREATOR_ONLY,
    SCREEN_SHARE_EVERYONE,
    VALID_SCREEN_SHARE_POLICIES,
)
from ..models.user import User
from ..services.participant_service import ParticipantService
from ..websocket.chat import chat_rooms
from ..websocket.signal import rooms as ws_rooms

rooms_router = APIRouter(prefix="/rooms", tags=["Rooms"])


class CreateRoomRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    camera_on_join: bool = True
    microphone_on_join: bool = True
    allow_participant_camera: bool = True
    allow_participant_microphone: bool = True
    screen_share_policy: str = SCREEN_SHARE_EVERYONE


class RoomResponse(BaseModel):
    room_id: str
    invite_code: str
    title: str
    created_at: str
    created_by: str
    status: Optional[str] = None
    participants: list = Field(default_factory=list)
    participants_count: int = 0
    camera_on_join: bool = True
    microphone_on_join: bool = True
    allow_participant_camera: bool = True
    allow_participant_microphone: bool = True
    screen_share_policy: str = SCREEN_SHARE_EVERYONE


class UpdateParticipantStatusRequest(BaseModel):
    is_muted: Optional[bool] = None
    is_video_off: Optional[bool] = None
    is_screen_sharing: Optional[bool] = None


def generate_invite_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _validate_policy(policy: str) -> str:
    normalized = str(policy).strip().lower()
    if normalized not in VALID_SCREEN_SHARE_POLICIES:
        raise HTTPException(status_code=400, detail="Неизвестная политика демонстрации экрана")
    return normalized


def _room_response(room: Room, participants: list[dict] | None = None) -> RoomResponse:
    participants = participants or []
    return RoomResponse(
        room_id=str(room.id),
        invite_code=room.invite_code,
        title=room.title,
        created_at=room.created_at.isoformat() if room.created_at else "",
        created_by=str(room.created_by),
        status=room.status.value if room.status else None,
        participants=participants,
        participants_count=len(participants),
        camera_on_join=bool(room.camera_on_join),
        microphone_on_join=bool(room.microphone_on_join),
        allow_participant_camera=bool(room.allow_participant_camera),
        allow_participant_microphone=bool(room.allow_participant_microphone),
        screen_share_policy=room.screen_share_policy or SCREEN_SHARE_EVERYONE,
    )


async def _close_room_sockets(invite_code: str, reason: str) -> None:
    signal_clients = list(ws_rooms.pop(invite_code, []))
    chat_clients = list(chat_rooms.pop(invite_code, []))

    for client in signal_clients + chat_clients:
        websocket = client.get("ws")
        if websocket is None:
            continue
        try:
            await websocket.close(code=1000, reason=reason)
        except Exception:
            pass


@rooms_router.post("/create", response_model=RoomResponse)
async def create_room(
    request: CreateRoomRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = generate_invite_code()
    while db.query(Room).filter(Room.invite_code == invite_code).first():
        invite_code = generate_invite_code()

    room = Room(
        title=request.title.strip(),
        invite_code=invite_code,
        created_by=current_user.id,
        camera_on_join=request.camera_on_join,
        microphone_on_join=request.microphone_on_join,
        allow_participant_camera=request.allow_participant_camera,
        allow_participant_microphone=request.allow_participant_microphone,
        screen_share_policy=_validate_policy(request.screen_share_policy),
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    return _room_response(room)


@rooms_router.get("/{invite_code}", response_model=RoomResponse)
async def get_room(invite_code: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.invite_code == invite_code.upper()).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    participants = []
    for participant, user in ParticipantService.get_participants_with_users(db, room.id):
        participants.append(
            {
                "user_id": str(user.id),
                "username": user.username,
                "joined_at": participant.joined_at.isoformat() if participant.joined_at else None,
                "is_muted": bool(participant.is_muted),
                "is_video_off": bool(participant.is_video_off),
                "is_screen_sharing": bool(participant.is_screen_sharing),
                "role": participant.role.value if participant.role else "speaker",
            }
        )
    return _room_response(room, participants)


@rooms_router.delete("/{invite_code}", summary="Завершить комнату")
async def delete_room(
    invite_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()
    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может завершить комнату")
    if room.status == RoomStatus.ended:
        raise HTTPException(status_code=400, detail="Комната уже завершена")

    await _close_room_sockets(invite_code, "Комната завершена создателем")
    for participant in ParticipantService.get_participants(db, room.id):
        ParticipantService.remove_participant(db, room.id, participant.user_id)

    room.status = RoomStatus.ended
    room.ended_at = datetime.now(timezone.utc)
    scheduled = db.query(ScheduledConference).filter(
        ScheduledConference.room_id == room.id,
    ).first()
    if scheduled and scheduled.status not in {ConferenceStatus.cancelled, ConferenceStatus.ended}:
        scheduled.status = ConferenceStatus.ended
    db.commit()
    return {"message": "Комната завершена", "room_id": str(room.id), "status": room.status.value}


@rooms_router.post("/{invite_code}/leave")
async def leave_room(
    invite_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()
    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    removed = ParticipantService.remove_participant(db, room.id, current_user.id)

    clients = ws_rooms.get(invite_code, [])
    own_clients = [client for client in clients if str(client.get("user_id")) == str(current_user.id)]
    ws_rooms[invite_code] = [client for client in clients if client not in own_clients]
    if not ws_rooms.get(invite_code):
        ws_rooms.pop(invite_code, None)
    for client in own_clients:
        try:
            await client["ws"].close(code=1000, reason="Пользователь вышел из комнаты")
        except Exception:
            pass

    return {
        "message": "Вы вышли из комнаты",
        "room_id": str(room.id),
        "removed": removed,
        "room_status": room.status.value,
    }


@rooms_router.patch("/{invite_code}/participants/status")
async def update_participant_status(
    invite_code: str,
    request: UpdateParticipantStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()
    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status != RoomStatus.active:
        raise HTTPException(status_code=400, detail="Комната не активна")

    is_creator = room.created_by == current_user.id

    if request.is_video_off is False and not room.allow_participant_camera and not is_creator:
        raise HTTPException(
            status_code=403,
            detail="Организатор запретил участникам включать камеру",
        )

    if request.is_muted is False and not room.allow_participant_microphone and not is_creator:
        raise HTTPException(
            status_code=403,
            detail="Организатор запретил участникам включать микрофон",
        )

    requested_screen = request.is_screen_sharing
    if (
        requested_screen is True
        and room.screen_share_policy == SCREEN_SHARE_CREATOR_ONLY
        and room.created_by != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Демонстрация экрана разрешена только создателю встречи",
        )

    participant = ParticipantService.update_status(
        db,
        room.id,
        current_user.id,
        is_muted=request.is_muted,
        is_video_off=request.is_video_off,
        is_screen_sharing=request.is_screen_sharing,
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Пользователь не находится в этой комнате")

    status_update = {
        "type": "media-status",
        "userId": str(current_user.id),
        "user_id": str(current_user.id),
        "username": current_user.username,
        "isMuted": bool(participant.is_muted),
        "is_muted": bool(participant.is_muted),
        "isVideoOff": bool(participant.is_video_off),
        "is_video_off": bool(participant.is_video_off),
        "isScreenSharing": bool(participant.is_screen_sharing),
        "is_screen_sharing": bool(participant.is_screen_sharing),
    }
    for client in list(ws_rooms.get(invite_code, [])):
        if str(client.get("user_id")) == str(current_user.id):
            continue
        try:
            await client["ws"].send_text(json.dumps(status_update))
        except Exception:
            pass

    return {"message": "Статус участника обновлён", "status": status_update}


@rooms_router.get("/", summary="Получить список активных комнат")
async def get_rooms(db: Session = Depends(get_db)):
    result = []
    for room in db.query(Room).filter(Room.status == RoomStatus.active).all():
        creator = db.query(User).filter(User.id == room.created_by).first()
        result.append(
            {
                "room_id": str(room.id),
                "invite_code": room.invite_code,
                "title": room.title,
                "created_by": creator.username if creator else "Неизвестный",
                "created_at": room.created_at.isoformat() if room.created_at else None,
                "participants_count": len(ParticipantService.get_participants(db, room.id)),
                "status": room.status.value,
            }
        )
    return {"total": len(result), "rooms": result}


async def _send_control_notification(invite_code: str, user_id: uuid.UUID, action: str, reason: str):
    if invite_code not in ws_rooms:
        return

    for client in ws_rooms[invite_code]:
        if str(client.get("user_id")) == str(user_id):
            try:
                await client["ws"].send_text(json.dumps({
                    "type": "control_action",
                    "action": action,
                    "reason": reason
                }))
            except Exception:
                pass
            break


async def _broadcast_status_update(invite_code: str, user_id: uuid.UUID, participant):
    if invite_code not in ws_rooms:
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        username = user.username if user else "Участник"
    finally:
        db.close()

    status_update = {
        "type": "media-status",
        "userId": str(user_id),
        "user_id": str(user_id),
        "username": username,
        "isMuted": bool(participant.is_muted),
        "is_muted": bool(participant.is_muted),
        "isVideoOff": bool(participant.is_video_off),
        "is_video_off": bool(participant.is_video_off),
        "isScreenSharing": bool(participant.is_screen_sharing),
        "is_screen_sharing": bool(participant.is_screen_sharing),
    }

    for client in ws_rooms[invite_code]:
        try:
            await client["ws"].send_text(json.dumps(status_update))
        except Exception:
            pass

@rooms_router.patch("/{invite_code}/participants/{user_id}/mute",
                    summary="Выключить микрофон участника (только для создателя)")
async def mute_participant(
        invite_code: str,
        user_id: str,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()

    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может управлять участниками")

    if room.status != RoomStatus.active:
        raise HTTPException(status_code=400, detail="Комната не активна")

    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный ID пользователя")

    participant = db.query(RoomParticipant).filter(
        RoomParticipant.room_id == room.id,
        RoomParticipant.user_id == target_uuid,
        RoomParticipant.left_at.is_(None)
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден в этой комнате")

    if participant.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя выключить микрофон самому себе")

    participant.is_muted = True
    db.commit()

    await _send_control_notification(
        invite_code,
        target_uuid,
        "mute",
        "Организатор выключил ваш микрофон"
    )

    await _broadcast_status_update(invite_code, target_uuid, participant)

    return {
        "message": "Микрофон участника выключен",
        "user_id": user_id,
        "is_muted": True
    }


@rooms_router.patch("/{invite_code}/participants/{user_id}/video-off",
                    summary="Выключить камеру участника (только для создателя)")
async def video_off_participant(
        invite_code: str,
        user_id: str,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()

    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может управлять участниками")

    if room.status != RoomStatus.active:
        raise HTTPException(status_code=400, detail="Комната не активна")

    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный ID пользователя")

    participant = db.query(RoomParticipant).filter(
        RoomParticipant.room_id == room.id,
        RoomParticipant.user_id == target_uuid,
        RoomParticipant.left_at.is_(None)
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден в этой комнате")

    if participant.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя выключить камеру самому себе")

    participant.is_video_off = True
    db.commit()

    await _send_control_notification(
        invite_code,
        target_uuid,
        "video_off",
        "Организатор выключил вашу камеру"
    )

    await _broadcast_status_update(invite_code, target_uuid, participant)

    return {
        "message": "Камера участника выключена",
        "user_id": user_id,
        "is_video_off": True
    }


@rooms_router.patch("/{invite_code}/participants/{user_id}/screen-off",
                    summary="Остановить демонстрацию экрана участника (только для создателя)")
async def screen_off_participant(
        invite_code: str,
        user_id: str,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()

    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может управлять участниками")

    if room.status != RoomStatus.active:
        raise HTTPException(status_code=400, detail="Комната не активна")

    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный ID пользователя")

    participant = db.query(RoomParticipant).filter(
        RoomParticipant.room_id == room.id,
        RoomParticipant.user_id == target_uuid,
        RoomParticipant.left_at.is_(None)
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден в этой комнате")

    if participant.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя остановить демонстрацию самому себе")

    if not participant.is_screen_sharing:
        raise HTTPException(status_code=400, detail="Участник не демонстрирует экран")

    participant.is_screen_sharing = False
    db.commit()

    await _send_control_notification(
        invite_code,
        target_uuid,
        "screen_off",
        "Организатор остановил вашу демонстрацию экрана"
    )

    await _broadcast_status_update(invite_code, target_uuid, participant)

    return {
        "message": "Демонстрация экрана участника остановлена",
        "user_id": user_id,
        "is_screen_sharing": False
    }


async def _broadcast_participant_removed(invite_code: str, user_id: uuid.UUID, username: str):
    if invite_code not in ws_rooms:
        return

    payload = {
        "type": "participant_removed",
        "user_id": str(user_id),
        "username": username
    }

    for client in ws_rooms[invite_code]:
        try:
            await client["ws"].send_text(json.dumps(payload))
        except Exception:
            pass


@rooms_router.delete("/{invite_code}/participants/{user_id}",
                     summary="Исключить участника из комнаты (только для создателя)")
async def remove_participant(
        invite_code: str,
        user_id: str,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    invite_code = invite_code.upper()

    room = db.query(Room).filter(Room.invite_code == invite_code).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    if room.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может исключать участников")

    if room.status != RoomStatus.active:
        raise HTTPException(status_code=400, detail="Комната не активна")

    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный ID пользователя")

    if target_uuid == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя исключить самого себя")

    participant = db.query(RoomParticipant).filter(
        RoomParticipant.room_id == room.id,
        RoomParticipant.user_id == target_uuid,
        RoomParticipant.left_at.is_(None)
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден в этой комнате")

    target_user = db.query(User).filter(User.id == target_uuid).first()
    target_username = target_user.username if target_user else "Участник"

    participant.left_at = datetime.now(timezone.utc)
    participant.is_screen_sharing = False
    db.commit()

    if invite_code in ws_rooms:
        for client in ws_rooms[invite_code]:
            if str(client.get("user_id")) == str(target_uuid):
                try:
                    await client["ws"].close(
                        code=1000,
                        reason="Вы были исключены из комнаты организатором"
                    )
                except Exception:
                    pass
        ws_rooms[invite_code] = [
            client for client in ws_rooms[invite_code]
            if str(client.get("user_id")) != str(target_uuid)
        ]
        if not ws_rooms[invite_code]:
            del ws_rooms[invite_code]

    await _broadcast_participant_removed(invite_code, target_uuid, target_username)

    return {
        "message": f"Участник {target_username} исключён из комнаты",
        "user_id": user_id
    }
