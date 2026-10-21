import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:8000").rstrip("/")
        self.DATABASE_URL = os.getenv("BOARD_DATABASE_URL", "sqlite:///./board.db")
        self.CORS_ORIGINS = [
            item.strip()
            for item in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        ]


settings = Settings()
