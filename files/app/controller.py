from uuid import UUID

from fastapi import UploadFile

from .access_guard import AccessGuard
from .domain import FileMeta


class FilesController:
    def __init__(self, guard: AccessGuard) -> None:
        self.guard = guard

    async def upload(self, invite_code: str, token: str, file: UploadFile) -> FileMeta:
        data = await file.read()
        return await self.guard.upload(invite_code, token, file.filename or "file", data)

    async def download(self, invite_code: str, file_id: UUID, token: str) -> tuple[FileMeta, bytes]:
        return await self.guard.download(invite_code, file_id, token)

    async def list_files(self, invite_code: str, token: str) -> list[FileMeta]:
        return await self.guard.list_files(invite_code, token)

    async def close_folder(self, invite_code: str, token: str) -> None:
        await self.guard.close_folder(invite_code, token)
