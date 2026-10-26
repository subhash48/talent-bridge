"""The candidate's message threads with the hiring team, one per application.

It is the same messages table and thread the recruiter's inbox shows: a candidate's message arrives
there unread, and the recruiter's replies arrive here unread until the candidate opens Messages. A
candidate can always read their thread, but can only write in it once a recruiter has turned on
messaging for that application (applications.candidate_messaging_enabled).
What kind of message it is (a thank-you note, a follow-up) is the candidate's own choice in the
portal; the text is never analysed to guess.
"""

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType, MessageKind, SenderType
from app.core.errors import ForbiddenError
from app.models import Candidate, Message
from app.models.base import utcnow
from app.schemas.portal import MessageThread, PortalMessage
from app.services.activity_service import record_activity
from app.services.candidate_portal_service import current_application, owned_application, require_record
from app.services.candidate_visibility import INCOMING_SENDERS, present_message
from app.services.message_service import excerpt

MESSAGING_OFF = "Messaging will become available when the hiring team enables it."
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
    return MessageThread(
        recruiter=record.recruiter,
        unread=record.unread,
        messages=record.messages,
        can_message=record.application.messaging_enabled,
    )


async def send_message(
    session: AsyncSession,
    candidate: Candidate,
    content: str,
    *,
    kind: MessageKind = MessageKind.MESSAGE,
    application_id: uuid.UUID | None = None,
) -> PortalMessage:
    application = await owned_application(session, candidate, application_id)
    if not application.candidate_messaging_enabled:
        raise ForbiddenError(MESSAGING_OFF, code="messaging_disabled")
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
    company = application.job.company.name
    await session.commit()
    presented = present_message(message, candidate_name=candidate.full_name, recruiter_name=None, company=company)
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
    await session.execute(
        update(Message).where(Message.application_id == application.id, CANDIDATE_UNREAD).values(read_at=utcnow())
    )
    await session.commit()
