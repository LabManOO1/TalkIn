from fastapi import APIRouter
from pydantic import BaseModel, Field

from .stubs import calendar_event, invitation_mail, meeting_report, recent

stubs_router = APIRouter(prefix="/integrations/stubs", tags=["Integration stubs"])


class CalendarStubRequest(BaseModel):
    title: str
    start: str
    end: str
    invite_code: str
    link: str
    organizer: str = ""


class MailStubRequest(BaseModel):
    to: str
    subject: str
    body: str = ""
    organizer: str = ""


class ReportStubRequest(BaseModel):
    title: str
    invite_code: str
    participants: list[str] = Field(default_factory=list)
    messages: list[str] = Field(default_factory=list)
    duration_seconds: int | None = None


@stubs_router.get("/")
async def list_stub_calls():
    return {"items": recent()}


@stubs_router.post("/calendar")
async def calendar_stub(body: CalendarStubRequest):
    return calendar_event(
        title=body.title,
        start=body.start,
        end=body.end,
        invite_code=body.invite_code,
        link=body.link,
        organizer=body.organizer,
    )


@stubs_router.post("/mail")
async def mail_stub(body: MailStubRequest):
    return invitation_mail(
        email=body.to,
        subject=body.subject,
        body=body.body,
        organizer_name=body.organizer,
    )


@stubs_router.post("/report")
async def report_stub(body: ReportStubRequest):
    return meeting_report(
        title=body.title,
        invite_code=body.invite_code,
        participants=body.participants,
        messages=body.messages,
        duration_seconds=body.duration_seconds,
    )
