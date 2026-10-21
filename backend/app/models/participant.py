import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, ForeignKey, UUID
from sqlalchemy.sql import func

from ..database import Base


class ParticipantRole(str, enum.Enum):
    speaker = "speaker"
    moderator = "moderator"
    viewer = "viewer"


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)
    is_muted = Column(Boolean, default=True, nullable=False)
    is_video_off = Column(Boolean, default=True, nullable=False)
    is_screen_sharing = Column(Boolean, default=False, nullable=False)
    role = Column(SQLEnum(ParticipantRole), default=ParticipantRole.speaker, nullable=False)
