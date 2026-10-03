"""Message threads, one per application. Recruiters send; the AI only drafts."""

import uuid
from collections import defaultdict

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.core.enums import ActivityType, SenderType
from app.core.errors import BadRequestError
from app.models import Application, Message, User
from app.models.base import utcnow
from app.schemas.common import CandidateRef
from app.schemas.message import Conversation, MessageRead
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
            messages=[MessageRead.model_validate(m) for m in threads[app_id]],
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
    rows = await session.scalars(
        select(Message).where(Message.application_id == application_id).order_by(Message.created_at, Message.id)
    )
    return [MessageRead.model_validate(row) for row in rows]


async def send_message(
    session: AsyncSession, application_id: uuid.UUID, content: str, actor: User | None
) -> MessageRead:
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
    record_activity(
        session,
        application.id,
        ActivityType.MESSAGE_SENT,
        "Message sent",
        description=excerpt(content),
        metadata={"message_id": message.id, "sent_by": actor.full_name if actor else None},
        at=now,
    )
    await session.commit()
    return MessageRead.model_validate(message)


def excerpt(content: str, limit: int = 140) -> str:
    """A message as a timeline description."""
    return content if len(content) <= limit else f"{content[: limit - 1]}…"


async def mark_read(session: AsyncSession, application_id: uuid.UUID) -> None:
    await get_application(session, application_id)
    await session.execute(
        update(Message).where(Message.application_id == application_id, UNREAD).values(read_at=utcnow())
    )
    await session.commit()
