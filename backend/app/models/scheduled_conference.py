import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, ForeignKey, String, Text, UUID
from sqlalchemy.sql import func

from ..database import Base
from .room import SCREEN_SHARE_EVERYONE


class ConferenceStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    ended = "ended"
    cancelled = "cancelled"


class ScheduledConference(Base):
    __tablename__ = "scheduled_conferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    scheduled_start = Column(DateTime(timezone=True), nullable=False, index=True)
    scheduled_end = Column(DateTime(timezone=True), nullable=True)
    timezone = Column(String(50), default="UTC", nullable=False)
    status = Column(SQLEnum(ConferenceStatus), default=ConferenceStatus.scheduled, nullable=False)
    camera_on_join = Column(Boolean, default=True, nullable=False)
    microphone_on_join = Column(Boolean, default=True, nullable=False)
    allow_participant_camera = Column(Boolean, default=True, nullable=False)
    allow_participant_microphone = Column(Boolean, default=True, nullable=False)
    screen_share_policy = Column(String(32), default=SCREEN_SHARE_EVERYONE, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
