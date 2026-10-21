from uuid import UUID

from .access_client import AccessClient, AccessDenied
from .domain import MeetingFolder
from .folder_manager import FolderClosed, FolderManager


class AccessGuard:
    def __init__(self, access: AccessClient, folders: FolderManager) -> None:
        self.access = access
        self.folders = folders

    async def assert_open(self, invite_code: str, token: str) -> MeetingFolder:
        user, meeting_id = await self.access.verify(token, invite_code)
        if not user.is_member:
            raise AccessDenied("Нет участия в этой встрече")
        folder = self.folders.ensure_folder(meeting_id, invite_code)
        if folder.status.value != "open":
            raise FolderClosed("Папка встречи закрыта")
        return folder

    async def assert_creator(self, invite_code: str, token: str) -> MeetingFolder:
        user, meeting_id = await self.access.verify(token, invite_code, allow_ended=True)
        if not user.is_creator:
            raise AccessDenied("Только создатель встречи может закрыть папку")
        return self.folders.ensure_folder(meeting_id, invite_code)
