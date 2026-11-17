from uuid import UUID

from .domain import ApplyResult, BoardEvent, BoardSnapshot
from .operations import BoardOperation, CursorOperation, MoveOperation, ShapeOperation
from .repository import BoardRepository


class CanvasEngine:
    def __init__(self, repository: BoardRepository | None = None) -> None:
        self.repository = repository
        self._operations: dict[str, BoardOperation] = {
            "shape": ShapeOperation(),
            "move": MoveOperation(),
            "cursor": CursorOperation(),
        }
        self.strategy: BoardOperation | None = None

    def load_snapshot(self, room_id: UUID, invite_code: str) -> BoardSnapshot:
        if self.repository is None:
            raise RuntimeError("Репозиторий доски не подключён")
        return self.repository.load_snapshot(room_id, invite_code)

    def apply(self, invite_code: str, event: BoardEvent) -> ApplyResult:
        snapshot = self.load_snapshot(event.room_id, invite_code)
        result = self.handle(snapshot, event)
        if self.repository is not None and not result.conflict and event.type != "cursor":
            self.repository.save_snapshot(result.snapshot, invite_code)
        return result

    def set_strategy(self, strategy: BoardOperation) -> None:
        self.strategy = strategy

    def handle(self, snapshot: BoardSnapshot, event: BoardEvent) -> ApplyResult:
        operation = self._operations.get(event.type)
        if operation is None:
            raise ValueError("Неизвестный тип операции доски")
        self.set_strategy(operation)
        if event.type != "cursor" and event.base_revision not in (None, snapshot.revision):
            return ApplyResult(snapshot=snapshot, conflict=True)
        updated = self.strategy.apply(snapshot, event)
        return ApplyResult(snapshot=updated, conflict=False)
