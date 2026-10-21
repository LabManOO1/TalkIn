import uuid

from sqlalchemy import Column, DateTime, Integer, JSON, String, Uuid
from sqlalchemy.sql import func

from .database import Base


class BoardSnapshotRow(Base):
    __tablename__ = "board_snapshots"

    room_id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invite_code = Column(String(20), nullable=False, unique=True, index=True)
    shapes = Column(JSON, nullable=False, default=list)
    revision = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
