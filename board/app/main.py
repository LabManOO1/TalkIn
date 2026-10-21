from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .access_client import AccessClient
from .canvas_engine import CanvasEngine
from .config import settings
from .controller import BoardController
from .database import Base, engine
from .models import BoardSnapshotRow
from .repository import BoardRepository
from .session_manager import SessionManager

Base.metadata.create_all(bind=engine)

repository = BoardRepository()
sessions = SessionManager(AccessClient(settings.BACKEND_API_URL), repository)
controller = BoardController(sessions, CanvasEngine(), repository)

app = FastAPI(
    title="TalkSphere Board",
    description="Микросервис общей доски встречи",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/board/{invite_code}")
async def board_socket(
    websocket: WebSocket,
    invite_code: str,
    token: str = Query(...),
):
    await controller.accept(websocket, invite_code, token)


__all__ = ["app", "BoardSnapshotRow"]
