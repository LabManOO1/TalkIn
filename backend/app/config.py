import os
from dotenv import load_dotenv

load_dotenv()


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
        self.SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
        self.DEBUG = _as_bool(os.getenv("DEBUG"), False)
        self.CORS_ORIGINS = [
            item.strip()
            for item in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        ]

        if not self.DATABASE_URL:
            raise RuntimeError("Переменная окружения DATABASE_URL не задана")
        if not self.SECRET_KEY:
            raise RuntimeError("Переменная окружения SECRET_KEY не задана")


settings = Settings()
