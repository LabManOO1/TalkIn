import unittest
import uuid

from app.canvas_engine import CanvasEngine
from app.domain import BoardEvent, BoardSnapshot


class CanvasTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = CanvasEngine()
        self.room_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.snapshot = BoardSnapshot(room_id=self.room_id, shapes=[], revision=0)

    def test_shape_then_move(self) -> None:
        created = self.engine.handle(
            self.snapshot,
            BoardEvent("shape", self.room_id, self.user_id, {"id": "s1", "kind": "rect", "x": 10, "y": 20}, 0),
        )
        self.assertFalse(created.conflict)
        self.assertEqual(created.snapshot.revision, 1)
        moved = self.engine.handle(
            created.snapshot,
            BoardEvent("move", self.room_id, self.user_id, {"id": "s1", "x": 40, "y": 50}, 1),
        )
        self.assertEqual(moved.snapshot.shapes[0]["x"], 40)
        self.assertEqual(moved.snapshot.revision, 2)

    def test_stale_revision_is_conflict(self) -> None:
        self.snapshot.revision = 3
        result = self.engine.handle(
            self.snapshot,
            BoardEvent("shape", self.room_id, self.user_id, {"id": "s2"}, 1),
        )
        self.assertTrue(result.conflict)
        self.assertEqual(result.snapshot.revision, 3)
        self.assertEqual(result.snapshot.shapes, [])

    def test_cursor_does_not_change_revision(self) -> None:
        result = self.engine.handle(
            self.snapshot,
            BoardEvent("cursor", self.room_id, self.user_id, {"x": 5, "y": 6}, None),
        )
        self.assertEqual(result.snapshot.revision, 0)
        self.assertEqual(result.snapshot.cursors[str(self.user_id)]["x"], 5)


if __name__ == "__main__":
    unittest.main()
