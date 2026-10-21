from uuid import UUID

from fastapi import UploadFile

from .access_guard import AccessGuard
from .domain import FileMeta
from .folder_manager import FolderManager


class FilesController:
    def __init__(self, guard: AccessGuard, folders: FolderManager) -> None:
        self.guard = guard
        self.folders = folders

    async def upload(self, invite_code: str, token: str, file: UploadFile) -> FileMeta:
        folder = await self.guard.assert_open(invite_code, token)
        data = await file.read()
        return self.folders.put_file(folder, file.filename or "file", data)

    async def download(self, invite_code: str, file_id: UUID, token: str) -> tuple[FileMeta, bytes]:
        folder = await self.guard.assert_open(invite_code, token)
        meta = self.folders.get_meta(folder, file_id)
        return meta, self.folders.get_file(folder, file_id)

    async def list_files(self, invite_code: str, token: str) -> list[FileMeta]:
        folder = await self.guard.assert_open(invite_code, token)
        return self.folders.list_files(folder)

    async def close_folder(self, invite_code: str, token: str) -> None:
        folder = await self.guard.assert_creator(invite_code, token)
        self.folders.close_folder(folder.meeting_id)
