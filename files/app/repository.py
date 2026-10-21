from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .domain import FileMeta, FolderStatus, MeetingFolder
from .models import Base, FileRow, MeetingFolderRow


class FolderRepository:
    def __init__(self, database_url: str) -> None:
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(database_url, pool_pre_ping=True, connect_args=connect_args)
        Base.metadata.create_all(bind=self.engine)
        self._session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def dispose(self) -> None:
        self.engine.dispose()

    def get_folder(self, meeting_id: UUID) -> MeetingFolder | None:
        db = self._session()
        try:
            row = db.query(MeetingFolderRow).filter(MeetingFolderRow.meeting_id == meeting_id).first()
            return self._folder(row) if row else None
        finally:
            db.close()

    def save_folder(self, folder: MeetingFolder) -> MeetingFolder:
        db = self._session()
        try:
            row = db.query(MeetingFolderRow).filter(MeetingFolderRow.meeting_id == folder.meeting_id).first()
            if row is None:
                row = MeetingFolderRow(
                    meeting_id=folder.meeting_id,
                    invite_code=folder.invite_code,
                    status=folder.status.value,
                    path=folder.path,
                )
                db.add(row)
            else:
                row.status = folder.status.value
                row.path = folder.path
                row.invite_code = folder.invite_code
            db.commit()
            return folder
        finally:
            db.close()

    def add_file(self, meta: FileMeta, stored_name: str) -> FileMeta:
        db = self._session()
        try:
            db.add(
                FileRow(
                    id=meta.id,
                    meeting_id=meta.meeting_id,
                    name=meta.name,
                    stored_name=stored_name,
                    size=meta.size,
                )
            )
            db.commit()
            return meta
        finally:
            db.close()

    def list_files(self, meeting_id: UUID) -> list[FileMeta]:
        db = self._session()
        try:
            rows = db.query(FileRow).filter(FileRow.meeting_id == meeting_id).all()
            return [self._meta(row) for row in rows]
        finally:
            db.close()

    def get_file(self, meeting_id: UUID, file_id: UUID) -> tuple[FileMeta, str] | None:
        db = self._session()
        try:
            row = db.query(FileRow).filter(
                FileRow.meeting_id == meeting_id,
                FileRow.id == file_id,
            ).first()
            if row is None:
                return None
            return self._meta(row), row.stored_name
        finally:
            db.close()

    def folder_size(self, meeting_id: UUID) -> int:
        db = self._session()
        try:
            rows = db.query(FileRow).filter(FileRow.meeting_id == meeting_id).all()
            return sum(int(row.size or 0) for row in rows)
        finally:
            db.close()

    @staticmethod
    def _folder(row: MeetingFolderRow) -> MeetingFolder:
        return MeetingFolder(
            meeting_id=row.meeting_id,
            status=FolderStatus(row.status),
            path=row.path,
            invite_code=row.invite_code,
        )

    @staticmethod
    def _meta(row: FileRow) -> FileMeta:
        return FileMeta(
            id=row.id,
            name=row.name,
            size=int(row.size),
            meeting_id=row.meeting_id,
        )


def folder_path(root: Path, meeting_id: UUID) -> str:
    return str((root / str(meeting_id)).resolve())
