import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:8000").rstrip("/")
        self.DATABASE_URL = os.getenv("FILES_DATABASE_URL", "sqlite:///./files.db")
        self.STORAGE_DIR = Path(os.getenv("FILES_STORAGE_DIR", "./storage")).resolve()
        self.MAX_FILE_BYTES = int(os.getenv("FILES_MAX_FILE_BYTES", str(20 * 1024 * 1024)))
        self.MAX_FOLDER_BYTES = int(os.getenv("FILES_MAX_FOLDER_BYTES", str(100 * 1024 * 1024)))
        self.CORS_ORIGINS = [
            item.strip()
            for item in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        ]


settings = Settings()
