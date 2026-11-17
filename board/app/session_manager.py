from uuid import UUID, uuid4

from .auth import AccessDenied, Auth
from .canvas_engine import CanvasEngine
from .domain import ApplyResult, BoardEvent, BoardSession, BoardSnapshot, UserContext


class SessionManager:
    def __init__(self, auth: Auth, engine: CanvasEngine) -> None:
        self.auth = auth
        self.engine = engine
        self._sessions: dict[UUID, BoardSession] = {}

    async def join(self, invite_code: str, token: str) -> tuple[BoardSession, BoardSnapshot]:
        user, room_id = await self.auth.verify(token, invite_code)
        if not user.is_member:
            raise AccessDenied("Нет участия в этой встрече")
        code = invite_code.upper()
        snapshot = self.engine.load_snapshot(room_id, code)
        session = BoardSession(
            id=uuid4(),
            room_id=room_id,
            user_id=user.user_id,
            can_write=self._can_write(user),
            invite_code=code,
            username=user.username,
        )
        self._sessions[session.id] = session
        return session, snapshot

    def submit(self, session: BoardSession, event: BoardEvent) -> ApplyResult:
        if event.type != "cursor" and not self.can_edit(session):
            raise AccessDenied("Нет права изменять доску")
        return self.engine.apply(session.invite_code, event)

    def leave(self, session_id: UUID) -> BoardSession | None:
        return self._sessions.pop(session_id, None)

    def can_edit(self, session: BoardSession) -> bool:
        return session.can_write

    def get(self, session_id: UUID) -> BoardSession | None:
        return self._sessions.get(session_id)

    def online(self, room_id: UUID) -> list[dict]:
        return [
            {
                "user_id": str(session.user_id),
                "username": session.username,
                "can_write": session.can_write,
            }
            for session in self._sessions.values()
            if session.room_id == room_id
        ]

    @staticmethod
    def _can_write(user: UserContext) -> bool:
        return user.is_member and user.role != "viewer"
