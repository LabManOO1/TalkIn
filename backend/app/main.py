from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers.auth import auth_router
from .routers.rooms import rooms_router
from .routers.schedule import schedule_router
from .websocket.chat import chat_router
from .websocket.signal import signal_router

app = FastAPI(
    title="TalkSphere API",
    description="Бэкенд платформы видеоконференций",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(schedule_router)
app.include_router(chat_router)
app.include_router(signal_router)


@app.get("/")
async def root():
    return {"message": "TalkSphere API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
