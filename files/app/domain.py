from dataclasses import dataclass
from enum import Enum
from uuid import UUID


class FolderStatus(str, Enum):
    open = "open"
    closed = "closed"


@dataclass
class FileMeta:
    id: UUID
    name: str
    size: int
    meeting_id: UUID

    def to_public(self) -> dict:
        return {
            "id": str(self.id),
            "name": self.name,
            "size": self.size,
            "meeting_id": str(self.meeting_id),
        }


@dataclass
class MeetingFolder:
    meeting_id: UUID
    status: FolderStatus
    path: str
    invite_code: str


@dataclass
class UserContext:
    user_id: UUID
    is_member: bool
    is_creator: bool
    username: str
