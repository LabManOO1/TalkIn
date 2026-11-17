from fastapi import APIRouter
from . import signal, chat

ws_router = APIRouter()

ws_router.include_router(signal.signal_router)
ws_router.include_router(chat.chat_router)
