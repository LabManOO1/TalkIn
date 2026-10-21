from .domain import ApplyResult, BoardEvent, BoardSnapshot
from .operations import BoardOperation, CursorOperation, MoveOperation, ShapeOperation


class CanvasEngine:
    def __init__(self) -> None:
        self._operations: dict[str, BoardOperation] = {
            "shape": ShapeOperation(),
            "move": MoveOperation(),
            "cursor": CursorOperation(),
        }
        self.strategy: BoardOperation | None = None

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
