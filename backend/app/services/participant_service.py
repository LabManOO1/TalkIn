from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from ..models.participant import ParticipantRole, RoomParticipant
from ..models.user import User


class ParticipantService:
    @staticmethod
    def add_participant(
        db: Session,
        room_id: uuid.UUID,
        user_id: uuid.UUID,
        role: ParticipantRole = ParticipantRole.speaker,
        *,
        is_muted: bool = True,
        is_video_off: bool = True,
        is_screen_sharing: bool = False,
    ) -> RoomParticipant:
        existing = db.query(RoomParticipant).filter(
            RoomParticipant.room_id == room_id,
            RoomParticipant.user_id == user_id,
            RoomParticipant.left_at.is_(None),
        ).first()

        if existing:
            existing.is_muted = is_muted
            existing.is_video_off = is_video_off
            existing.is_screen_sharing = is_screen_sharing
            db.commit()
            db.refresh(existing)
            return existing

        participant = RoomParticipant(
            room_id=room_id,
            user_id=user_id,
            role=role,
            is_muted=is_muted,
            is_video_off=is_video_off,
            is_screen_sharing=is_screen_sharing,
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)
        return participant

    @staticmethod
    def remove_participant(db: Session, room_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        participant = db.query(RoomParticipant).filter(
            RoomParticipant.room_id == room_id,
            RoomParticipant.user_id == user_id,
            RoomParticipant.left_at.is_(None),
        ).first()

        if not participant:
            return False

        participant.left_at = datetime.now(timezone.utc)
        participant.is_screen_sharing = False
        db.commit()
        return True

    @staticmethod
    def update_status(
        db: Session,
        room_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        is_muted: bool | None = None,
        is_video_off: bool | None = None,
        is_screen_sharing: bool | None = None,
    ) -> RoomParticipant | None:
        participant = db.query(RoomParticipant).filter(
            RoomParticipant.room_id == room_id,
            RoomParticipant.user_id == user_id,
            RoomParticipant.left_at.is_(None),
        ).first()
        if not participant:
            return None

        if is_muted is not None:
            participant.is_muted = is_muted
        if is_video_off is not None:
            participant.is_video_off = is_video_off
        if is_screen_sharing is not None:
            participant.is_screen_sharing = is_screen_sharing
        db.commit()
        db.refresh(participant)
        return participant

    @staticmethod
    def get_participants(db: Session, room_id: uuid.UUID):
        return db.query(RoomParticipant).filter(
            RoomParticipant.room_id == room_id,
            RoomParticipant.left_at.is_(None),
        ).all()

    @staticmethod
    def get_participants_with_users(db: Session, room_id: uuid.UUID):
        return db.query(RoomParticipant, User).join(
            User, RoomParticipant.user_id == User.id,
        ).filter(
            RoomParticipant.room_id == room_id,
            RoomParticipant.left_at.is_(None),
        ).all()
