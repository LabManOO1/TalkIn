import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from app.domain import FolderStatus
from app.folder_manager import FolderClosed, FolderManager
from app.repository import FolderRepository
from app.storage import DiskStorageAdapter


class FolderManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.repository = FolderRepository(f"sqlite:///{root / 'files.db'}")
        self.manager = FolderManager(
            DiskStorageAdapter(root / "storage"),
            self.repository,
            root / "storage",
            max_file_bytes=10,
            max_folder_bytes=15,
        )
        self.meeting_id = uuid4()

    def tearDown(self) -> None:
        self.repository.dispose()
        self.tmp.cleanup()

    def test_upload_download_and_close(self) -> None:
        folder = self.manager.ensure_folder(self.meeting_id, "ABC123")
        meta = self.manager.put_file(folder, "notes.txt", b"hello")
        self.assertEqual(self.manager.get_file(folder, meta.id), b"hello")

        self.manager.close_folder(self.meeting_id)
        closed = self.manager.ensure_folder(self.meeting_id, "ABC123")
        self.assertEqual(closed.status, FolderStatus.closed)
        with self.assertRaises(FolderClosed):
            self.manager.put_file(closed, "more.txt", b"nope")
        with self.assertRaises(FolderClosed):
            self.manager.get_file(closed, meta.id)

    def test_folder_limit(self) -> None:
        folder = self.manager.ensure_folder(self.meeting_id, "LIM001")
        self.manager.put_file(folder, "a.txt", b"1234567890")
        with self.assertRaises(ValueError):
            self.manager.put_file(folder, "b.txt", b"123456")

    def test_rejects_path_in_name(self) -> None:
        folder = self.manager.ensure_folder(self.meeting_id, "PATH01")
        meta = self.manager.put_file(folder, "../secret.txt", b"data")
        self.assertEqual(meta.name, "secret.txt")
        stored = list(Path(folder.path).iterdir())
        self.assertEqual(len(stored), 1)
        self.assertFalse(stored[0].name.startswith(".."))


if __name__ == "__main__":
    unittest.main()
