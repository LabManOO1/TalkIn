from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class UserContext:
    user_id: UUID
    is_member: bool
    username: str
    role: str


@dataclass
class BoardSession:
    id: UUID
    room_id: UUID
    user_id: UUID
    can_write: bool
    invite_code: str
    username: str


@dataclass
class BoardSnapshot:
    room_id: UUID
    shapes: list[dict]
    revision: int
    cursors: dict[str, dict] = field(default_factory=dict)

    def to_public(self) -> dict:
        return {
            "room_id": str(self.room_id),
            "revision": self.revision,
            "shapes": self.shapes,
            "cursors": self.cursors,
        }


@dataclass
class BoardEvent:
    type: str
    room_id: UUID
    user_id: UUID
    payload: dict
    base_revision: int | None = None


@dataclass
class ApplyResult:
    snapshot: BoardSnapshot
    conflict: bool
