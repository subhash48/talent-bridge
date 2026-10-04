"""The candidate's message threads with the hiring team, one per application.

It is the same messages table and thread the recruiter's inbox shows: a candidate's message arrives
there unread, and the recruiter's replies arrive here unread until the candidate opens Messages.
What kind of message it is (a thank-you note, a follow-up) is the candidate's own choice in the
portal; the text is never analysed to guess.
"""

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType, EngagementEventType, MessageKind, SenderType
from app.models import Candidate, Message
from app.models.base import utcnow
from app.schemas.portal import MessageThread, PortalMessage
from app.services.activity_service import record_activity
from app.services.candidate_portal_service import current_application, owned_application, require_record
from app.services.candidate_visibility import INCOMING_SENDERS, present_message
from app.services.engagement.events import record_unless_recent
from app.services.message_service import excerpt

CANDIDATE_UNREAD = Message.sender_type.in_(INCOMING_SENDERS) & Message.read_at.is_(None)
# The recruiter's timeline entry for a message the candidate started (a reply is "Replied to message").
TITLES = {
    MessageKind.MESSAGE: "Sent a message",
    MessageKind.THANK_YOU: "Sent a thank-you note",
    MessageKind.FOLLOW_UP: "Sent a follow-up",
    MessageKind.QUESTION: "Asked a question",
}


async def get_thread(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None
) -> MessageThread:
    record = await require_record(session, candidate, application_id)
    return MessageThread(recruiter=record.recruiter, unread=record.unread, messages=record.messages)


async def send_message(
    session: AsyncSession,
    candidate: Candidate,
    content: str,
    *,
    kind: MessageKind = MessageKind.MESSAGE,
    application_id: uuid.UUID | None = None,
) -> PortalMessage:
    application = await owned_application(session, candidate, application_id)
    is_reply = await session.scalar(
        select(Message.id)
        .where(Message.application_id == application.id, Message.sender_type == SenderType.RECRUITER)
        .limit(1)
    )
    now = utcnow()
    message = Message(
        application_id=application.id, sender_type=SenderType.CANDIDATE, content=content, kind=kind, created_at=now
    )
    session.add(message)
    await session.flush()
    record_activity(
        session,
        application.id,
        ActivityType.MESSAGE_RECEIVED,
        "Replied to message" if is_reply and kind == MessageKind.MESSAGE else TITLES[kind],
        description=excerpt(content),
        metadata={"message_id": message.id, "kind": kind, "via": "candidate_portal"},
        at=now,
    )
    await session.commit()
    presented = present_message(
        message, candidate_name=candidate.full_name, recruiter_name=None, company=settings.organization_name
    )
    assert presented is not None  # candidate messages are always visible to the candidate
    return presented


async def mark_read(session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None) -> None:
    """The candidate opened the thread: everything the hiring team sent in it is now read."""
    if application_id is None:
        application = await current_application(session, candidate.id)
        if application is None:
            return
    else:
        application = await owned_application(session, candidate, application_id)
    result = await session.execute(
        update(Message).where(Message.application_id == application.id, CANDIDATE_UNREAD).values(read_at=utcnow())
    )
    if result.rowcount:  # type: ignore[attr-defined]
        await record_unless_recent(
            session, candidate.id, EngagementEventType.MESSAGE_READ, application_id=application.id
        )
    await session.commit()
