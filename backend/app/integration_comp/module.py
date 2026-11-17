import asyncio
import json
import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage
from urllib import error, request

from ..config import settings
from .stubs import calendar_event, invitation_mail, meeting_report

logger = logging.getLogger(__name__)


class IntegrationModule:
    """Исходящие вызовы Backend API: почта, календарь, сервис ИИ и файловый сервис."""

    def __init__(self) -> None:
        self.settings = settings

    async def deliver_invitation(
        self,
        *,
        emails: list[str],
        title: str,
        start: datetime,
        end: datetime,
        invite_code: str,
        organizer_name: str,
    ) -> None:
        link = f"{self.settings.PUBLIC_APP_URL}/conference/{invite_code}"
        await self.publish_calendar_event(
            title=title,
            start=start,
            end=end,
            invite_code=invite_code,
            link=link,
            organizer_name=organizer_name,
        )
        for email in emails:
            await self.send_invitation_mail(
                email=email,
                title=title,
                start=start,
                end=end,
                link=link,
                organizer_name=organizer_name,
            )

    async def finish_meeting(
        self,
        *,
        invite_code: str,
        token: str,
        title: str,
        participants: list[str],
        messages: list[str],
        started_at: datetime | None,
        ended_at: datetime | None,
    ) -> str | None:
        await self.close_meeting_folder(invite_code, token)
        return await self.request_meeting_report(
            title=title,
            invite_code=invite_code,
            participants=participants,
            messages=messages,
            started_at=started_at,
            ended_at=ended_at,
        )

    async def send_invitation_mail(
        self,
        *,
        email: str,
        title: str,
        start: datetime,
        end: datetime,
        link: str,
        organizer_name: str,
    ) -> None:
        if not email:
            return
        subject = f"Приглашение: {title}"
        body = (
            f"{organizer_name} приглашает на встречу «{title}».\n"
            f"Начало: {start.isoformat()}\n"
            f"Окончание: {end.isoformat()}\n"
            f"Ссылка: {link}\n"
        )
        if not self.settings.SMTP_HOST:
            await asyncio.to_thread(
                invitation_mail,
                email=email,
                subject=subject,
                body=body,
                organizer_name=organizer_name,
            )
            return
        await asyncio.to_thread(
            self._send_mail,
            email,
            subject,
            body,
        )

    async def publish_calendar_event(
        self,
        *,
        title: str,
        start: datetime,
        end: datetime,
        invite_code: str,
        link: str,
        organizer_name: str,
    ) -> None:
        payload = {
            "title": title,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "invite_code": invite_code,
            "link": link,
            "organizer": organizer_name,
        }
        if not self.settings.GOOGLE_CALENDAR_URL:
            await asyncio.to_thread(calendar_event, **payload)
            return
        await asyncio.to_thread(
            self._post_json,
            self.settings.GOOGLE_CALENDAR_URL,
            payload,
            None,
        )

    async def close_meeting_folder(self, invite_code: str, token: str) -> None:
        if not self.settings.FILES_SERVICE_URL or not token:
            return
        url = f"{self.settings.FILES_SERVICE_URL}/files/{invite_code}/close"
        await asyncio.to_thread(self._post_json, url, {}, token)

    async def request_meeting_report(
        self,
        *,
        title: str,
        invite_code: str,
        participants: list[str],
        messages: list[str],
        started_at: datetime | None,
        ended_at: datetime | None,
    ) -> str | None:
        duration = None
        if started_at and ended_at:
            duration = max(0, int((ended_at - started_at).total_seconds()))
        payload = {
            "title": title,
            "invite_code": invite_code,
            "participants": participants,
            "messages": messages,
            "duration_seconds": duration,
        }
        if not self.settings.AI_REPORT_URL:
            stub = await asyncio.to_thread(meeting_report, **payload)
            return str(stub.get("text") or "")
        response = await asyncio.to_thread(
            self._post_json,
            self.settings.AI_REPORT_URL,
            payload,
            None,
        )
        if not isinstance(response, dict):
            return None
        report = response.get("text") or response.get("report")
        return str(report) if report else None

    def _send_mail(self, email: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.settings.SMTP_FROM or self.settings.SMTP_USER
        message["To"] = email
        message["Subject"] = subject
        message.set_content(body)
        try:
            with smtplib.SMTP(self.settings.SMTP_HOST, self.settings.SMTP_PORT, timeout=5) as smtp:
                smtp.starttls()
                if self.settings.SMTP_USER:
                    smtp.login(self.settings.SMTP_USER, self.settings.SMTP_PASSWORD)
                smtp.send_message(message)
        except Exception:
            logger.exception("Не удалось отправить письмо-приглашение на %s", email)

    def _post_json(self, url: str, payload: dict, token: str | None):
        data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = request.Request(url, data=data, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=5) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            logger.warning("Интеграция %s вернула %s", url, exc.code)
            return None
        except Exception:
            logger.exception("Интеграция %s недоступна", url)
            return None
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"text": raw}


integration = IntegrationModule()
