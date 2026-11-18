from uuid import UUID

from .auth import AccessDenied, Auth
from .domain import FileMeta, MeetingFolder
from .folder_manager import FolderClosed, FolderManager


class AccessGuard:
    def __init__(self, auth: Auth, folders: FolderManager) -> None:
        self.auth = auth
        self.folders = folders

    async def upload(self, invite_code: str, token: str, name: str, data: bytes) -> FileMeta:
        folder = await self._open_folder(invite_code, token)
        return self.folders.put_file(folder, name, data)

    async def download(self, invite_code: str, file_id: UUID, token: str) -> tuple[FileMeta, bytes]:
        folder = await self._open_folder(invite_code, token)
        meta = self.folders.get_meta(folder, file_id)
        return meta, self.folders.get_file(folder, file_id)

    async def list_files(self, invite_code: str, token: str) -> list[FileMeta]:
        folder = await self._open_folder(invite_code, token)
        return self.folders.list_files(folder)

    async def close_folder(self, invite_code: str, token: str) -> None:
        folder = await self._creator_folder(invite_code, token)
        self.folders.close_folder(folder.meeting_id)

    async def _open_folder(self, invite_code: str, token: str) -> MeetingFolder:
        user, meeting_id = await self.auth.verify(token, invite_code)
        if not user.is_member:
            raise AccessDenied("Нет участия в этой встрече")
        folder = self.folders.ensure_folder(meeting_id, invite_code)
        if folder.status.value != "open":
            raise FolderClosed("Папка встречи закрыта")
        return folder

    async def _creator_folder(self, invite_code: str, token: str) -> MeetingFolder:
        user, meeting_id = await self.auth.verify(token, invite_code, allow_ended=True)
        if not user.is_creator:
            raise AccessDenied("Только создатель встречи может закрыть папку")
        return self.folders.ensure_folder(meeting_id, invite_code)
