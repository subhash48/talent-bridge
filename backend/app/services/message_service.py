"""Message threads, one per application. Recruiters send; the AI only drafts.

Sending is one path for every recruiter message, whether typed in the inbox, approved from an AI
draft or confirmed in the assistant: the message reaches the candidate portal and the timeline
(the audit entry) at once, with a delivery record; then, if an email provider is configured, it's
emailed and the delivery record says how that went. Email failing never unsends the portal message.
"""

import uuid
from collections import defaultdict

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.core.config import settings
from app.core.enums import ActivityType, EmailStatus, SenderType
from app.core.errors import BadRequestError
from app.integrations.email import EmailProvider, OutboundEmail
from app.models import Application, Message, MessageDelivery, User
from app.models.base import utcnow
from app.schemas.common import CandidateRef
from app.schemas.message import Conversation, MessageDeliveryRead, MessageRead
from app.services.activity_service import record_activity
from app.services.pipeline_service import get_application

UNREAD = (Message.sender_type == SenderType.CANDIDATE) & Message.read_at.is_(None)


async def list_conversations(session: AsyncSession) -> list[Conversation]:
    """Threads in the active pipeline, most recent message first."""
    rows = await session.execute(
        select(Message, Application)
        .join(Application, Message.application_id == Application.id)
        .join(Application.candidate)
        .join(Application.job)
        .options(contains_eager(Application.candidate), contains_eager(Application.job))
        .where(Application.archived_at.is_(None))
        .order_by(Message.created_at, Message.id)
    )
    threads: dict[uuid.UUID, list[Message]] = defaultdict(list)
    applications: dict[uuid.UUID, Application] = {}
    for message, application in rows.all():
        threads[application.id].append(message)
        applications[application.id] = application
    deliveries = await _deliveries(session, [m for thread in threads.values() for m in thread])

    conversations = [
        Conversation(
            candidate=CandidateRef(
                application_id=application.id,
                candidate_id=application.candidate.id,
                full_name=application.candidate.full_name,
                avatar_url=application.candidate.avatar_url,
                job_title=application.job.title,
            ),
            unread=sum(1 for m in threads[app_id] if m.sender_type == SenderType.CANDIDATE and m.read_at is None),
            messages=[_read(m, deliveries) for m in threads[app_id]],
        )
        for app_id, application in applications.items()
    ]
    return sorted(conversations, key=lambda c: c.messages[-1].created_at, reverse=True)


async def unread_thread_count(session: AsyncSession) -> int:
    count = await session.scalar(
        select(func.count(func.distinct(Message.application_id)))
        .join(Application, Message.application_id == Application.id)
        .where(UNREAD, Application.archived_at.is_(None))
    )
    return count or 0


async def list_messages(session: AsyncSession, application_id: uuid.UUID) -> list[MessageRead]:
    await get_application(session, application_id)
    rows = list(
        await session.scalars(
            select(Message).where(Message.application_id == application_id).order_by(Message.created_at, Message.id)
        )
    )
    deliveries = await _deliveries(session, rows)
    return [_read(row, deliveries) for row in rows]


async def send_message(
    session: AsyncSession,
    application_id: uuid.UUID,
    content: str,
    actor: User | None,
    email: EmailProvider,
    *,
    subject: str | None = None,
    draft_id: uuid.UUID | None = None,
) -> MessageRead:
    """Send a recruiter's message: portal and timeline first, then email. The caller has the
    recruiter's approval; nothing here is ever sent on its own."""
    application = await get_application(session, application_id)
    if application.archived_at is not None:
        raise BadRequestError(
            f"Restore {application.candidate.first_name} to the pipeline before messaging them.",
            code="application_archived",
        )
    now = utcnow()
    message = Message(application_id=application.id, sender_type=SenderType.RECRUITER, content=content, created_at=now)
    session.add(message)
    await session.flush()
    delivery = MessageDelivery(
        message_id=message.id,
        subject=subject or default_subject(application),
        email_status=EmailStatus.PENDING if email.configured else EmailStatus.NOT_CONFIGURED,
        provider=email.name if email.configured else None,
        draft_id=draft_id,
        attempted_at=now,
    )
    session.add(delivery)
    record_activity(
        session,
        application.id,
        ActivityType.MESSAGE_SENT,
        "Message sent",
        description=excerpt(content),
        metadata={
            "message_id": message.id,
            "sent_by": actor.full_name if actor else None,
            "draft_id": draft_id,
        },
        at=now,
    )
    await session.commit()  # in the portal now, whatever happens to the email

    if email.configured:
        result = await email.send(
            OutboundEmail(
                to=application.candidate.email,
                subject=delivery.subject,
                text=email_text(application, content),
                idempotency_key=str(message.id),
            )
        )
        delivery.email_status = result.status
        delivery.provider_message_id = result.provider_message_id
        delivery.error = result.error
        delivery.sent_at = utcnow() if result.status == EmailStatus.SENT else None
        await session.commit()
    return _read(message, {message.id: delivery})


def default_subject(application: Application) -> str:
    return f"Your {application.job.title} application at {application.job.company.name}"


def email_text(application: Application, content: str) -> str:
    """The message as an email. Replies go through the portal, where the recruiter reads them (once the hiring
    team has turned on messaging for this application)."""
    portal = f"{settings.frontend_url.rstrip('/')}/candidate/messages"
    how = "To reply, or to see" if application.candidate_messaging_enabled else "To see"
    return (
        f"{content}\n\n"
        "--\n"
        f"{how} where your application stands, open your candidate portal: {portal}\n"
        f"{application.job.company.name} · {application.job.title}"
    )


async def with_deliveries(session: AsyncSession, messages: list[Message]) -> list[MessageRead]:
    """Messages as the recruiter sees them: each of theirs with how it was delivered."""
    deliveries = await _deliveries(session, messages)
    return [_read(message, deliveries) for message in messages]


async def _deliveries(session: AsyncSession, messages: list[Message]) -> dict[uuid.UUID, MessageDelivery]:
    ids = [message.id for message in messages if message.sender_type == SenderType.RECRUITER]
    if not ids:
        return {}
    rows = await session.scalars(select(MessageDelivery).where(MessageDelivery.message_id.in_(ids)))
    return {row.message_id: row for row in rows}


def _read(message: Message, deliveries: dict[uuid.UUID, MessageDelivery]) -> MessageRead:
    read = MessageRead.model_validate(message)
    delivery = deliveries.get(message.id)
    return read.model_copy(update={"delivery": MessageDeliveryRead.model_validate(delivery)}) if delivery else read


def excerpt(content: str, limit: int = 140) -> str:
    """A message as a timeline description."""
    return content if len(content) <= limit else f"{content[: limit - 1]}…"


async def mark_read(session: AsyncSession, application_id: uuid.UUID) -> None:
    await get_application(session, application_id)
    await session.execute(
        update(Message).where(Message.application_id == application_id, UNREAD).values(read_at=utcnow())
    )
    await session.commit()
