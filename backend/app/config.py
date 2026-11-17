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

        self.PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173").rstrip("/")
        self.SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
        self.SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
        self.SMTP_USER = os.getenv("SMTP_USER", "").strip()
        self.SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
        self.SMTP_FROM = os.getenv("SMTP_FROM", self.SMTP_USER).strip()
        self.GOOGLE_CALENDAR_URL = os.getenv("GOOGLE_CALENDAR_URL", "").strip()
        self.AI_REPORT_URL = os.getenv("AI_REPORT_URL", "").strip()
        self.FILES_SERVICE_URL = os.getenv("FILES_SERVICE_URL", "http://localhost:8002").rstrip("/")

        if not self.DATABASE_URL:
            raise RuntimeError("Переменная окружения DATABASE_URL не задана")
        if not self.SECRET_KEY:
            raise RuntimeError("Переменная окружения SECRET_KEY не задана")


settings = Settings()
