import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models.room import (
    Room,
    RoomStatus,
    SCREEN_SHARE_EVERYONE,
    VALID_SCREEN_SHARE_POLICIES,
)
from ..models.scheduled_conference import ConferenceStatus, ScheduledConference
from ..models.scheduled_participant import (
    INVITATION_ACCEPTED,
    INVITATION_DECLINED,
    INVITATION_PENDING,
    ScheduledParticipant,
)
from ..models.user import User
from ..websocket.chat import chat_rooms
from ..websocket.signal import rooms as ws_rooms

schedule_router = APIRouter(prefix="/schedule", tags=["Schedule"])


class CreateScheduleRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=3000)
    scheduled_start: datetime
    scheduled_end: Optional[datetime] = None
    timezone: str = Field(default="UTC", max_length=50)
    participant_ids: List[str] = Field(default_factory=list)
    participant_emails: List[EmailStr] = Field(default_factory=list)
    camera_on_join: bool = True
    microphone_on_join: bool = True
    allow_participant_camera: bool = True
    allow_participant_microphone: bool = True
    screen_share_policy: str = SCREEN_SHARE_EVERYONE


class UpdateScheduleRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=3000)
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    timezone: Optional[str] = Field(default=None, max_length=50)
    participant_ids: Optional[List[str]] = None
    participant_emails: Optional[List[EmailStr]] = None
    camera_on_join: Optional[bool] = None
    microphone_on_join: Optional[bool] = None
    allow_participant_camera: Optional[bool] = None
    allow_participant_microphone: Optional[bool] = None
    screen_share_policy: Optional[str] = None


class InvitationResponseRequest(BaseModel):
    status: Literal["accepted", "declined"]


class ScheduleResponse(BaseModel):
    id: str
    room_id: Optional[str] = None
    room_invite_code: Optional[str] = None
    invite_code: Optional[str] = None
    title: str
    description: Optional[str] = None
    scheduled_start: str
    scheduled_end: Optional[str] = None
    timezone: str
    status: str
    created_by: str
    created_by_id: str
    is_creator: bool = False
    participants: List[dict] = Field(default_factory=list)
    participants_count: int = 0
    camera_on_join: bool
    microphone_on_join: bool
    allow_participant_camera: bool
    allow_participant_microphone: bool
    screen_share_policy: str
    invitation_status: Optional[str] = None
    invitation_is_read: Optional[bool] = None
    invitation_id: Optional[str] = None


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _policy(value: str) -> str:
    normalized = str(value).strip().lower()
    if normalized not in VALID_SCREEN_SHARE_POLICIES:
        raise HTTPException(status_code=400, detail="Неизвестная политика демонстрации экрана")
    return normalized


def _invite_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _unique_invite_code(db: Session) -> str:
    code = _invite_code()
    while db.query(Room).filter(Room.invite_code == code).first():
        code = _invite_code()
    return code


def _resolve_participants(
    db: Session,
    creator_id: uuid.UUID,
    participant_ids: list[str] | None,
    participant_emails: list[EmailStr] | None,
) -> tuple[list[User], list[str]]:
    resolved: dict[str, User] = {}
    unresolved_emails: list[str] = []

    for value in participant_ids or []:
        try:
            user_id = uuid.UUID(str(value))
        except (ValueError, TypeError):
            continue
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.id != creator_id:
            resolved[str(user.id)] = user

    normalized_emails = list(
        dict.fromkeys(
            str(value).strip().lower()
            for value in participant_emails or []
            if str(value).strip()
        )
    )

    for email in normalized_emails:
        user = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
        if not user:
            unresolved_emails.append(email)
            continue
        if user.id != creator_id:
            resolved[str(user.id)] = user

    return list(resolved.values()), unresolved_emails


def _participants(db: Session, scheduled_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(ScheduledParticipant, User)
        .join(User, ScheduledParticipant.user_id == User.id)
        .filter(ScheduledParticipant.scheduled_conference_id == scheduled_id)
        .order_by(User.username)
        .all()
    )
    return [
        {
            "user_id": str(participant.user_id),
            "username": user.username,
            "email": user.email,
            "invitation_status": participant.status,
            "invitation_is_read": bool(participant.is_read),
        }
        for participant, user in rows
    ]


def _invitation_for_user(
    db: Session,
    scheduled_id: uuid.UUID,
    current_user_id: uuid.UUID | None,
) -> ScheduledParticipant | None:
    if current_user_id is None:
        return None
    return (
        db.query(ScheduledParticipant)
        .filter(
            ScheduledParticipant.scheduled_conference_id == scheduled_id,
            ScheduledParticipant.user_id == current_user_id,
        )
        .first()
    )


def _serialize(
    db: Session,
    scheduled: ScheduledConference,
    current_user_id: uuid.UUID | None = None,
) -> dict:
    room = db.query(Room).filter(Room.id == scheduled.room_id).first() if scheduled.room_id else None
    creator = db.query(User).filter(User.id == scheduled.created_by).first()
    participants = _participants(db, scheduled.id)
    invitation = _invitation_for_user(db, scheduled.id, current_user_id)

    return {
        "id": str(scheduled.id),
        "room_id": str(scheduled.room_id) if scheduled.room_id else None,
        "room_invite_code": room.invite_code if room else None,
        "invite_code": room.invite_code if room else None,
        "title": scheduled.title,
        "description": scheduled.description,
        "scheduled_start": scheduled.scheduled_start.isoformat(),
        "scheduled_end": scheduled.scheduled_end.isoformat() if scheduled.scheduled_end else None,
        "timezone": scheduled.timezone,
        "status": scheduled.status.value,
        "created_at": scheduled.created_at.isoformat() if scheduled.created_at else None,
        "created_by": creator.username if creator else "Неизвестный",
        "created_by_id": str(scheduled.created_by),
        "is_creator": current_user_id is not None and scheduled.created_by == current_user_id,
        "participants": participants,
        "participants_count": len(participants),
        "camera_on_join": bool(scheduled.camera_on_join),
        "microphone_on_join": bool(scheduled.microphone_on_join),
        "allow_participant_camera": bool(scheduled.allow_participant_camera),
        "allow_participant_microphone": bool(scheduled.allow_participant_microphone),
        "screen_share_policy": scheduled.screen_share_policy or SCREEN_SHARE_EVERYONE,
        "invitation_status": invitation.status if invitation else None,
        "invitation_is_read": bool(invitation.is_read) if invitation else None,
        "invitation_id": str(invitation.id) if invitation else None,
    }


def _visible_invited_ids(db: Session, user_id: uuid.UUID):
    return db.query(ScheduledParticipant.scheduled_conference_id).filter(
        ScheduledParticipant.user_id == user_id,
        ScheduledParticipant.status != INVITATION_DECLINED,
    )


def _raise_unknown_participants(emails: list[str]) -> None:
    if not emails:
        return
    shown = ", ".join(emails[:5])
    suffix = "" if len(emails) <= 5 else f" и ещё {len(emails) - 5}"
    raise HTTPException(
        status_code=400,
        detail=(
            "Не найдены зарегистрированные пользователи с email: "
            f"{shown}{suffix}. Приглашать в календарь можно только пользователей TalkSphere."
        ),
    )


async def _close_sockets(invite_code: str, reason: str) -> None:
    clients = list(ws_rooms.pop(invite_code, [])) + list(chat_rooms.pop(invite_code, []))
    for client in clients:
        try:
            await client["ws"].close(code=1000, reason=reason)
        except Exception:
            pass


@schedule_router.post("/", response_model=ScheduleResponse)
async def create_scheduled_conference(
    request: CreateScheduleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _aware(request.scheduled_start)
    end = _aware(request.scheduled_end) if request.scheduled_end else start + timedelta(hours=1)
    now = datetime.now(timezone.utc)
    if start < now - timedelta(minutes=1):
        raise HTTPException(status_code=400, detail="Нельзя планировать встречу в прошлом")
    if end <= start:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")
    if end - start > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Длительность встречи не может превышать 24 часа")

    invited_users, unresolved_emails = _resolve_participants(
        db,
        current_user.id,
        request.participant_ids,
        request.participant_emails,
    )
    _raise_unknown_participants(unresolved_emails)

    screen_share_policy = _policy(request.screen_share_policy)
    room = Room(
        title=request.title.strip(),
        invite_code=_unique_invite_code(db),
        created_by=current_user.id,
        status=RoomStatus.active,
        camera_on_join=request.camera_on_join,
        microphone_on_join=request.microphone_on_join,
        allow_participant_camera=request.allow_participant_camera,
        allow_participant_microphone=request.allow_participant_microphone,
        screen_share_policy=screen_share_policy,
    )
    db.add(room)
    db.flush()

    scheduled = ScheduledConference(
        room_id=room.id,
        created_by=current_user.id,
        title=request.title.strip(),
        description=request.description.strip() if request.description else None,
        scheduled_start=start,
        scheduled_end=end,
        timezone=request.timezone or "UTC",
        status=ConferenceStatus.scheduled,
        camera_on_join=request.camera_on_join,
        microphone_on_join=request.microphone_on_join,
        allow_participant_camera=request.allow_participant_camera,
        allow_participant_microphone=request.allow_participant_microphone,
        screen_share_policy=screen_share_policy,
    )
    db.add(scheduled)
    db.flush()

    for user in invited_users:
        db.add(
            ScheduledParticipant(
                scheduled_conference_id=scheduled.id,
                user_id=user.id,
                status=INVITATION_PENDING,
                is_read=False,
            )
        )

    db.commit()
    db.refresh(scheduled)
    return ScheduleResponse(**_serialize(db, scheduled, current_user.id))


@schedule_router.get("/")
async def get_scheduled_conferences(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invited_ids = _visible_invited_ids(db, current_user.id)
    query = db.query(ScheduledConference).filter(
        or_(
            ScheduledConference.created_by == current_user.id,
            ScheduledConference.id.in_(invited_ids),
        )
    )
    if start_date:
        query = query.filter(ScheduledConference.scheduled_start >= _aware(start_date))
    if end_date:
        query = query.filter(ScheduledConference.scheduled_start < _aware(end_date))
    if status:
        try:
            query = query.filter(ScheduledConference.status == ConferenceStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Неизвестный статус встречи") from exc

    meetings = query.order_by(ScheduledConference.scheduled_start).all()
    return {
        "total": len(meetings),
        "conferences": [_serialize(db, item, current_user.id) for item in meetings],
    }


@schedule_router.get("/calendar")
async def get_calendar_view(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _aware(start_date)
    end = _aware(end_date)
    if end <= start:
        raise HTTPException(status_code=400, detail="Конец периода должен быть позже начала")

    invited_ids = _visible_invited_ids(db, current_user.id)
    meetings = (
        db.query(ScheduledConference)
        .filter(
            or_(
                ScheduledConference.created_by == current_user.id,
                ScheduledConference.id.in_(invited_ids),
            ),
            ScheduledConference.scheduled_start < end,
            or_(
                ScheduledConference.scheduled_end > start,
                ScheduledConference.scheduled_end.is_(None),
            ),
        )
        .order_by(ScheduledConference.scheduled_start)
        .all()
    )

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total": len(meetings),
        "conferences": [_serialize(db, item, current_user.id) for item in meetings],
    }


@schedule_router.get("/invitations")
async def get_invitations(
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(ScheduledParticipant, ScheduledConference)
        .join(
            ScheduledConference,
            ScheduledParticipant.scheduled_conference_id == ScheduledConference.id,
        )
        .filter(
            ScheduledParticipant.user_id == current_user.id,
            ScheduledParticipant.status != INVITATION_DECLINED,
            or_(
                ScheduledConference.scheduled_start >= datetime.now(timezone.utc) - timedelta(days=1),
                and_(
                    ScheduledConference.status == ConferenceStatus.cancelled,
                    ScheduledParticipant.is_read.is_(False),
                ),
            ),
        )
    )
    if unread_only:
        query = query.filter(ScheduledParticipant.is_read.is_(False))

    rows = (
        query.order_by(
            ScheduledParticipant.is_read.asc(),
            ScheduledConference.scheduled_start.asc(),
        )
        .limit(limit)
        .all()
    )

    invitations = []
    for invitation, scheduled in rows:
        data = _serialize(db, scheduled, current_user.id)
        data["notification_type"] = (
            "cancelled" if scheduled.status == ConferenceStatus.cancelled else "invitation"
        )
        invitations.append(data)

    return {
        "total": len(invitations),
        "unread_count": sum(1 for invitation, _ in rows if not invitation.is_read),
        "invitations": invitations,
    }


@schedule_router.patch("/invitations/{schedule_id}/read")
async def mark_invitation_read(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        schedule_uuid = uuid.UUID(schedule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неверный ID встречи") from exc

    invitation = (
        db.query(ScheduledParticipant)
        .filter(
            ScheduledParticipant.scheduled_conference_id == schedule_uuid,
            ScheduledParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")

    invitation.is_read = True
    db.commit()
    return {"message": "Приглашение отмечено как прочитанное", "id": schedule_id}


@schedule_router.post("/{schedule_id}/respond")
async def respond_to_invitation(
    schedule_id: str,
    request: InvitationResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        schedule_uuid = uuid.UUID(schedule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неверный ID встречи") from exc

    scheduled = db.query(ScheduledConference).filter(ScheduledConference.id == schedule_uuid).first()
    if not scheduled:
        raise HTTPException(status_code=404, detail="Встреча не найдена")

    invitation = (
        db.query(ScheduledParticipant)
        .filter(
            ScheduledParticipant.scheduled_conference_id == schedule_uuid,
            ScheduledParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if scheduled.status == ConferenceStatus.cancelled and request.status == INVITATION_ACCEPTED:
        raise HTTPException(status_code=400, detail="Нельзя принять приглашение на отменённую встречу")

    invitation.status = request.status
    invitation.is_read = True
    invitation.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(scheduled)
    return _serialize(db, scheduled, current_user.id)


@schedule_router.get("/{schedule_id}")
async def get_scheduled_conference(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sched_uuid = uuid.UUID(schedule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неверный ID") from exc

    scheduled = db.query(ScheduledConference).filter(ScheduledConference.id == sched_uuid).first()
    if not scheduled:
        raise HTTPException(status_code=404, detail="Встреча не найдена")
    invitation = _invitation_for_user(db, scheduled.id, current_user.id)
    if scheduled.created_by != current_user.id and not invitation:
        raise HTTPException(status_code=403, detail="Нет доступа к этой встрече")
    return _serialize(db, scheduled, current_user.id)


@schedule_router.put("/{schedule_id}")
async def update_scheduled_conference(
    schedule_id: str,
    request: UpdateScheduleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sched_uuid = uuid.UUID(schedule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неверный ID") from exc

    scheduled = db.query(ScheduledConference).filter(ScheduledConference.id == sched_uuid).first()
    if not scheduled:
        raise HTTPException(status_code=404, detail="Встреча не найдена")
    if scheduled.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать встречу")
    if scheduled.status == ConferenceStatus.cancelled:
        raise HTTPException(status_code=400, detail="Нельзя редактировать отменённую встречу")

    invited_users = None
    if request.participant_ids is not None or request.participant_emails is not None:
        invited_users, unresolved_emails = _resolve_participants(
            db,
            current_user.id,
            request.participant_ids or [],
            request.participant_emails or [],
        )
        _raise_unknown_participants(unresolved_emails)

    room = db.query(Room).filter(Room.id == scheduled.room_id).first() if scheduled.room_id else None
    if request.title is not None:
        scheduled.title = request.title.strip()
        if room:
            room.title = scheduled.title
    if request.description is not None:
        scheduled.description = request.description.strip() or None
    if request.scheduled_start is not None:
        scheduled.scheduled_start = _aware(request.scheduled_start)
    if request.scheduled_end is not None:
        scheduled.scheduled_end = _aware(request.scheduled_end)
    if scheduled.scheduled_end and scheduled.scheduled_end <= scheduled.scheduled_start:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")
    if request.timezone is not None:
        scheduled.timezone = request.timezone
    if request.camera_on_join is not None:
        scheduled.camera_on_join = request.camera_on_join
        if room:
            room.camera_on_join = request.camera_on_join
    if request.microphone_on_join is not None:
        scheduled.microphone_on_join = request.microphone_on_join
        if room:
            room.microphone_on_join = request.microphone_on_join
    if request.allow_participant_camera is not None:
        scheduled.allow_participant_camera = request.allow_participant_camera
        if room:
            room.allow_participant_camera = request.allow_participant_camera
    if request.allow_participant_microphone is not None:
        scheduled.allow_participant_microphone = request.allow_participant_microphone
        if room:
            room.allow_participant_microphone = request.allow_participant_microphone
    if request.screen_share_policy is not None:
        policy = _policy(request.screen_share_policy)
        scheduled.screen_share_policy = policy
        if room:
            room.screen_share_policy = policy

    existing_invitations = {
        str(item.user_id): item
        for item in db.query(ScheduledParticipant).filter(
            ScheduledParticipant.scheduled_conference_id == scheduled.id,
        )
    }

    if invited_users is not None:
        target_ids = {str(user.id) for user in invited_users}
        for user_id, invitation in existing_invitations.items():
            if user_id not in target_ids:
                db.delete(invitation)
        for user in invited_users:
            existing = existing_invitations.get(str(user.id))
            if existing:
                existing.is_read = False
            else:
                db.add(
                    ScheduledParticipant(
                        scheduled_conference_id=scheduled.id,
                        user_id=user.id,
                        status=INVITATION_PENDING,
                        is_read=False,
                    )
                )
    else:
        for invitation in existing_invitations.values():
            if invitation.status != INVITATION_DECLINED:
                invitation.is_read = False

    db.commit()
    db.refresh(scheduled)
    return _serialize(db, scheduled, current_user.id)


@schedule_router.delete("/{schedule_id}")
async def cancel_scheduled_conference(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        sched_uuid = uuid.UUID(schedule_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неверный ID") from exc

    scheduled = db.query(ScheduledConference).filter(ScheduledConference.id == sched_uuid).first()
    if not scheduled:
        raise HTTPException(status_code=404, detail="Встреча не найдена")
    if scheduled.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может отменить встречу")
    if scheduled.status == ConferenceStatus.cancelled:
        raise HTTPException(status_code=400, detail="Встреча уже отменена")

    scheduled.status = ConferenceStatus.cancelled
    for invitation in db.query(ScheduledParticipant).filter(
        ScheduledParticipant.scheduled_conference_id == scheduled.id,
    ):
        invitation.is_read = False

    room = db.query(Room).filter(Room.id == scheduled.room_id).first() if scheduled.room_id else None
    if room and room.status == RoomStatus.active:
        room.status = RoomStatus.ended
        room.ended_at = datetime.now(timezone.utc)
        await _close_sockets(room.invite_code, "Запланированная встреча отменена")
    db.commit()
    return {"message": f"Встреча {scheduled.title} отменена", "id": str(scheduled.id)}
