import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, ForeignKey, String, UUID
from sqlalchemy.sql import func

from ..database import Base


class RoomStatus(str, enum.Enum):
    active = "active"
    ended = "ended"
    archived = "archived"


SCREEN_SHARE_EVERYONE = "everyone"
SCREEN_SHARE_CREATOR_ONLY = "creator_only"
VALID_SCREEN_SHARE_POLICIES = {SCREEN_SHARE_EVERYONE, SCREEN_SHARE_CREATOR_ONLY}


class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    invite_code = Column(String(20), nullable=False, unique=True, index=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(SQLEnum(RoomStatus), default=RoomStatus.active, nullable=False)
    camera_on_join = Column(Boolean, default=True, nullable=False)
    microphone_on_join = Column(Boolean, default=True, nullable=False)
    allow_participant_camera = Column(Boolean, default=True, nullable=False)
    allow_participant_microphone = Column(Boolean, default=True, nullable=False)
    screen_share_policy = Column(
        String(32),
        default=SCREEN_SHARE_EVERYONE,
        nullable=False,
    )
