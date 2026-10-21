import copy
import uuid
from typing import Protocol

from .domain import BoardEvent, BoardSnapshot


class BoardOperation(Protocol):
    def apply(self, snapshot: BoardSnapshot, event: BoardEvent) -> BoardSnapshot:
        """Применяет одну операцию холста и возвращает обновлённый снимок."""


def _copy_shapes(snapshot: BoardSnapshot) -> list[dict]:
    return copy.deepcopy(snapshot.shapes)


class ShapeOperation:
    def apply(self, snapshot: BoardSnapshot, event: BoardEvent) -> BoardSnapshot:
        payload = dict(event.payload)
        shape_id = str(payload.get("id") or uuid.uuid4())
        shape = {
            "id": shape_id,
            "kind": str(payload.get("kind") or "rect"),
            "x": float(payload.get("x") or 0),
            "y": float(payload.get("y") or 0),
            "width": float(payload.get("width") or 0),
            "height": float(payload.get("height") or 0),
            "color": str(payload.get("color") or "#1f2937"),
            "text": str(payload.get("text") or ""),
        }
        shapes = _copy_shapes(snapshot)
        for index, current in enumerate(shapes):
            if str(current.get("id")) == shape_id:
                shapes[index] = shape
                break
        else:
            shapes.append(shape)
        snapshot.shapes = shapes
        snapshot.revision += 1
        return snapshot


class MoveOperation:
    def apply(self, snapshot: BoardSnapshot, event: BoardEvent) -> BoardSnapshot:
        shape_id = str(event.payload.get("id") or "")
        if not shape_id:
            raise ValueError("Для перемещения нужен id фигуры")
        shapes = _copy_shapes(snapshot)
        for shape in shapes:
            if str(shape.get("id")) == shape_id:
                shape["x"] = float(event.payload.get("x") or 0)
                shape["y"] = float(event.payload.get("y") or 0)
                snapshot.shapes = shapes
                snapshot.revision += 1
                return snapshot
        raise ValueError("Фигура не найдена")


class CursorOperation:
    def apply(self, snapshot: BoardSnapshot, event: BoardEvent) -> BoardSnapshot:
        user_key = str(event.user_id)
        if event.payload.get("remove"):
            snapshot.cursors.pop(user_key, None)
            return snapshot
        snapshot.cursors[user_key] = {
            "user_id": user_key,
            "x": float(event.payload.get("x") or 0),
            "y": float(event.payload.get("y") or 0),
        }
        return snapshot
