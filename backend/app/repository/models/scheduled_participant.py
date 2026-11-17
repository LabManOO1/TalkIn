import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, UUID, UniqueConstraint
from sqlalchemy.sql import func

from ..database import Base

INVITATION_PENDING = "pending"
INVITATION_ACCEPTED = "accepted"
INVITATION_DECLINED = "declined"
VALID_INVITATION_STATUSES = {
    INVITATION_PENDING,
    INVITATION_ACCEPTED,
    INVITATION_DECLINED,
}


class ScheduledParticipant(Base):
    __tablename__ = "scheduled_participants"
    __table_args__ = (
        UniqueConstraint(
            "scheduled_conference_id",
            "user_id",
            name="uq_scheduled_participant_conference_user",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scheduled_conference_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scheduled_conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(String(20), nullable=False, default=INVITATION_PENDING)
    is_read = Column(Boolean, nullable=False, default=False)
    invited_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    responded_at = Column(DateTime(timezone=True), nullable=True)
