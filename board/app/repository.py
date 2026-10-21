from uuid import UUID

from .database import SessionLocal
from .domain import BoardSnapshot
from .models import BoardSnapshotRow


class BoardRepository:
    def __init__(self) -> None:
        self._live: dict[UUID, BoardSnapshot] = {}

    def load_snapshot(self, room_id: UUID, invite_code: str) -> BoardSnapshot:
        cached = self._live.get(room_id)
        if cached is not None:
            return cached

        db = SessionLocal()
        try:
            row = db.query(BoardSnapshotRow).filter(BoardSnapshotRow.room_id == room_id).first()
            if row is None:
                snapshot = BoardSnapshot(room_id=room_id, shapes=[], revision=0)
            else:
                snapshot = BoardSnapshot(
                    room_id=room_id,
                    shapes=list(row.shapes or []),
                    revision=int(row.revision or 0),
                )
            self._live[room_id] = snapshot
            if row is None:
                self._insert(db, snapshot, invite_code)
            return snapshot
        finally:
            db.close()

    def save_snapshot(self, snapshot: BoardSnapshot, invite_code: str) -> None:
        self._live[snapshot.room_id] = snapshot
        db = SessionLocal()
        try:
            row = db.query(BoardSnapshotRow).filter(BoardSnapshotRow.room_id == snapshot.room_id).first()
            if row is None:
                self._insert(db, snapshot, invite_code)
                return
            row.shapes = snapshot.shapes
            row.revision = snapshot.revision
            row.invite_code = invite_code
            db.commit()
        finally:
            db.close()

    def _insert(self, db, snapshot: BoardSnapshot, invite_code: str) -> None:
        db.add(
            BoardSnapshotRow(
                room_id=snapshot.room_id,
                invite_code=invite_code,
                shapes=snapshot.shapes,
                revision=snapshot.revision,
            )
        )
        db.commit()
