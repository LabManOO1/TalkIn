import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
_calls: list[dict] = []


def recent(limit: int = 50) -> list[dict]:
    return list(_calls[-limit:])


def _remember(kind: str, payload: dict, response: dict) -> dict:
    _calls.append(
        {
            "kind": kind,
            "at": datetime.now(timezone.utc).isoformat(),
            "request": payload,
            "response": response,
        }
    )
    del _calls[:-50]
    logger.info("Заглушка %s: %s", kind, json.dumps(response, ensure_ascii=False))
    return response


def calendar_event(
    *,
    title: str,
    start: str,
    end: str,
    invite_code: str,
    link: str,
    organizer: str,
) -> dict:
    payload = {
        "title": title,
        "start": start,
        "end": end,
        "invite_code": invite_code,
        "link": link,
        "organizer": organizer,
    }
    return _remember(
        "calendar",
        payload,
        {
            "stub": True,
            "event_id": f"stub-{invite_code}",
            "status": "created",
            "htmlLink": link,
            "title": title,
            "start": start,
            "end": end,
        },
    )


def invitation_mail(
    *,
    email: str,
    subject: str,
    body: str,
    organizer_name: str,
) -> dict:
    payload = {
        "to": email,
        "subject": subject,
        "body": body,
        "organizer": organizer_name,
    }
    return _remember(
        "mail",
        payload,
        {
            "stub": True,
            "status": "accepted",
            "to": email,
            "subject": subject,
        },
    )


def meeting_report(
    *,
    title: str,
    invite_code: str,
    participants: list[str],
    messages: list[str],
    duration_seconds: int | None,
) -> dict:
    names = ", ".join(participants) if participants else "участники не указаны"
    payload = {
        "title": title,
        "invite_code": invite_code,
        "participants": participants,
        "messages": messages,
        "duration_seconds": duration_seconds,
    }
    text = (
        f"Заглушка отчёта по встрече «{title}». "
        f"Код: {invite_code}. Участники: {names}. "
        f"Сообщений в чате: {len(messages)}. "
        f"Длительность, с: {duration_seconds if duration_seconds is not None else 'неизвестно'}."
    )
    return _remember(
        "ai",
        payload,
        {"stub": True, "text": text, "report": text},
    )
