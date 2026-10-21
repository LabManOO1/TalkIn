from pathlib import Path
from uuid import UUID, uuid4

from .domain import FileMeta, FolderStatus, MeetingFolder
from .repository import FolderRepository, folder_path
from .storage import StoragePort


class FolderClosed(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class FolderManager:
    def __init__(
        self,
        storage: StoragePort,
        repository: FolderRepository,
        storage_root: Path,
        max_file_bytes: int,
        max_folder_bytes: int,
    ) -> None:
        self.storage = storage
        self.repository = repository
        self.storage_root = storage_root
        self.max_file_bytes = max_file_bytes
        self.max_folder_bytes = max_folder_bytes

    def ensure_folder(self, meeting_id: UUID, invite_code: str) -> MeetingFolder:
        existing = self.repository.get_folder(meeting_id)
        if existing is not None:
            return existing
        path = folder_path(self.storage_root, meeting_id)
        self.storage.mkdir(path)
        folder = MeetingFolder(
            meeting_id=meeting_id,
            status=FolderStatus.open,
            path=path,
            invite_code=invite_code.upper(),
        )
        return self.repository.save_folder(folder)

    def close_folder(self, meeting_id: UUID) -> None:
        folder = self.repository.get_folder(meeting_id)
        if folder is None:
            raise FolderClosed("Папка встречи не найдена")
        folder.status = FolderStatus.closed
        self.repository.save_folder(folder)

    def put_file(self, folder: MeetingFolder, name: str, data: bytes) -> FileMeta:
        if folder.status != FolderStatus.open:
            raise FolderClosed("Папка встречи закрыта")
        safe_name = Path(name).name.strip()
        if not safe_name or safe_name in {".", ".."}:
            raise ValueError("Некорректное имя файла")
        size = len(data)
        if size == 0:
            raise ValueError("Пустой файл")
        if size > self.max_file_bytes:
            raise ValueError("Файл больше допустимого размера")
        if self.repository.folder_size(folder.meeting_id) + size > self.max_folder_bytes:
            raise ValueError("Превышен лимит папки встречи")

        file_id = uuid4()
        suffix = Path(safe_name).suffix.lower()[:16]
        stored_name = f"{file_id}{suffix}"
        self.storage.write(str(Path(folder.path) / stored_name), data)
        meta = FileMeta(id=file_id, name=safe_name, size=size, meeting_id=folder.meeting_id)
        return self.repository.add_file(meta, stored_name)

    def get_file(self, folder: MeetingFolder, file_id: UUID) -> bytes:
        if folder.status != FolderStatus.open:
            raise FolderClosed("Папка встречи закрыта")
        found = self.repository.get_file(folder.meeting_id, file_id)
        if found is None:
            raise FileNotFoundError("Файл не найден")
        _meta, stored_name = found
        return self.storage.read(str(Path(folder.path) / stored_name))

    def get_meta(self, folder: MeetingFolder, file_id: UUID) -> FileMeta:
        found = self.repository.get_file(folder.meeting_id, file_id)
        if found is None:
            raise FileNotFoundError("Файл не найден")
        meta, _stored_name = found
        return meta

    def list_files(self, folder: MeetingFolder) -> list[FileMeta]:
        if folder.status != FolderStatus.open:
            raise FolderClosed("Папка встречи закрыта")
        return self.repository.list_files(folder.meeting_id)
