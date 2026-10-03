"""The candidate's message thread with the hiring team.

It is the same messages table and thread the recruiter's inbox shows: a candidate's message arrives
there unread, and the recruiter's replies arrive here unread until the candidate opens Messages.
"""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType, SenderType
from app.models import Candidate, Message
from app.models.base import utcnow
from app.schemas.portal import MessageThread, PortalMessage
from app.services.activity_service import record_activity
from app.services.candidate_portal_service import current_application, require_application, require_record
from app.services.candidate_visibility import INCOMING_SENDERS, present_message
from app.services.message_service import excerpt

CANDIDATE_UNREAD = Message.sender_type.in_(INCOMING_SENDERS) & Message.read_at.is_(None)


async def get_thread(session: AsyncSession, candidate: Candidate) -> MessageThread:
    record = await require_record(session, candidate)
    return MessageThread(recruiter=record.recruiter, unread=record.unread, messages=record.messages)


async def send_message(session: AsyncSession, candidate: Candidate, content: str) -> PortalMessage:
    application = await require_application(session, candidate.id)
    is_reply = await session.scalar(
        select(Message.id)
        .where(Message.application_id == application.id, Message.sender_type == SenderType.RECRUITER)
        .limit(1)
    )
    now = utcnow()
    message = Message(application_id=application.id, sender_type=SenderType.CANDIDATE, content=content, created_at=now)
    session.add(message)
    await session.flush()
    record_activity(
        session,
        application.id,
        ActivityType.MESSAGE_RECEIVED,
        "Replied to message" if is_reply else "Sent a message",
        description=excerpt(content),
        metadata={"message_id": message.id, "via": "candidate_portal"},
        at=now,
    )
    await session.commit()
    presented = present_message(
        message, candidate_name=candidate.full_name, recruiter_name=None, company=settings.organization_name
    )
    assert presented is not None  # candidate messages are always visible to the candidate
    return presented


async def mark_read(session: AsyncSession, candidate: Candidate) -> None:
    """The candidate opened their thread: everything the hiring team sent is now read."""
    application = await current_application(session, candidate.id)
    if application is None:
        return
    await session.execute(
        update(Message).where(Message.application_id == application.id, CANDIDATE_UNREAD).values(read_at=utcnow())
    )
    await session.commit()
