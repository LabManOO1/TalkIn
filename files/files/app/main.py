from uuid import UUID

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .access_client import AccessClient, AccessDenied
from .access_guard import AccessGuard
from .config import settings
from .controller import FilesController
from .folder_manager import FolderClosed, FolderManager
from .repository import FolderRepository
from .storage import DiskStorageAdapter

repository = FolderRepository(settings.DATABASE_URL)
storage = DiskStorageAdapter(settings.STORAGE_DIR)
folders = FolderManager(
    storage,
    repository,
    settings.STORAGE_DIR,
    settings.MAX_FILE_BYTES,
    settings.MAX_FOLDER_BYTES,
)
controller = FilesController(AccessGuard(AccessClient(settings.BACKEND_API_URL), folders), folders)

app = FastAPI(
    title="TalkSphere Files",
    description="Файлы одной встречи. После закрытия папки загрузка и скачивание прекращаются.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _token(authorization: str = Header(...)) -> str:
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        raise HTTPException(status_code=401, detail="Нужен заголовок Authorization: Bearer")
    return value


def _raise(exc: Exception) -> None:
    if isinstance(exc, AccessDenied):
        status = 401 if "токен" in exc.detail.lower() else 403
        raise HTTPException(status_code=status, detail=exc.detail) from exc
    if isinstance(exc, FolderClosed):
        raise HTTPException(status_code=403, detail=exc.detail) from exc
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/files/{invite_code}")
async def list_files(invite_code: str, token: str = Depends(_token)):
    try:
        items = await controller.list_files(invite_code, token)
    except Exception as exc:
        _raise(exc)
    return [item.to_public() for item in items]


@app.post("/files/{invite_code}")
async def upload_file(
    invite_code: str,
    file: UploadFile = File(...),
    token: str = Depends(_token),
):
    try:
        meta = await controller.upload(invite_code, token, file)
    except Exception as exc:
        _raise(exc)
    return meta.to_public()


@app.get("/files/{invite_code}/{file_id}")
async def download_file(invite_code: str, file_id: UUID, token: str = Depends(_token)):
    try:
        meta, data = await controller.download(invite_code, file_id, token)
    except Exception as exc:
        _raise(exc)
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{meta.name}"'},
    )


@app.post("/files/{invite_code}/close")
async def close_folder(invite_code: str, token: str = Depends(_token)):
    try:
        await controller.close_folder(invite_code, token)
    except Exception as exc:
        _raise(exc)
    return {"status": "closed"}
