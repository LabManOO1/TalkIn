from pathlib import Path
from typing import Protocol


class StoragePort(Protocol):
    def mkdir(self, path: str) -> None:
        """Создаёт каталог встречи."""

    def write(self, path: str, data: bytes) -> None:
        """Записывает файл по абсолютному пути внутри хранилища."""

    def read(self, path: str) -> bytes:
        """Читает файл по абсолютному пути внутри хранилища."""


class DiskStorageAdapter:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def mkdir(self, path: str) -> None:
        self._resolve(path).mkdir(parents=True, exist_ok=True)

    def write(self, path: str, data: bytes) -> None:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def read(self, path: str) -> bytes:
        return self._resolve(path).read_bytes()

    def _resolve(self, path: str) -> Path:
        target = Path(path).resolve()
        if target != self.root and self.root not in target.parents:
            raise ValueError("Путь вне хранилища файлов")
        return target
