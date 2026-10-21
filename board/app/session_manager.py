from uuid import UUID, uuid4

from .access_client import AccessClient, AccessDenied
from .domain import BoardSession, BoardSnapshot, UserContext
from .repository import BoardRepository


class SessionManager:
    def __init__(self, access: AccessClient, repository: BoardRepository) -> None:
        self.access = access
        self.repository = repository
        self._sessions: dict[UUID, BoardSession] = {}

    async def join(self, invite_code: str, token: str) -> tuple[BoardSession, BoardSnapshot]:
        user, room_id = await self.access.verify(token, invite_code)
        if not user.is_member:
            raise AccessDenied("Нет участия в этой встрече")
        snapshot = self.repository.load_snapshot(room_id, invite_code.upper())
        session = BoardSession(
            id=uuid4(),
            room_id=room_id,
            user_id=user.user_id,
            can_write=self._can_write(user),
            invite_code=invite_code.upper(),
            username=user.username,
        )
        self._sessions[session.id] = session
        return session, snapshot

    def leave(self, session_id: UUID) -> BoardSession | None:
        return self._sessions.pop(session_id, None)

    def can_edit(self, session: BoardSession) -> bool:
        return session.can_write

    def get(self, session_id: UUID) -> BoardSession | None:
        return self._sessions.get(session_id)

    @staticmethod
    def _can_write(user: UserContext) -> bool:
        return user.is_member and user.role != "viewer"
