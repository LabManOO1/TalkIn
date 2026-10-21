import uuid

from sqlalchemy import Column, DateTime, Integer, String, Uuid
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


class MeetingFolderRow(Base):
    __tablename__ = "meeting_folders"

    meeting_id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invite_code = Column(String(20), nullable=False, unique=True, index=True)
    status = Column(String(16), nullable=False, default="open")
    path = Column(String(500), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FileRow(Base):
    __tablename__ = "meeting_files"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(Uuid(as_uuid=True), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
