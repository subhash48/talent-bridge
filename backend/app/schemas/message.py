"""Message schemas: one thread per application."""

from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.core.enums import MessageKind, SenderType
from app.schemas.common import APIModel, CandidateRef, Timestamp


class MessageCreate(APIModel):
    """A recruiter's message. The AI only drafts; this endpoint is always a person sending."""

    content: Annotated[str, Field(min_length=1, max_length=5000)]


class MessageRead(APIModel):
    id: UUID
    application_id: UUID
    sender_type: SenderType
    content: str
    kind: MessageKind = MessageKind.MESSAGE  # the candidate's own label: a thank-you note, a follow-up
    created_at: Timestamp
    read_at: Timestamp | None = None


class Conversation(APIModel):
    candidate: CandidateRef
    unread: int
    messages: list[MessageRead]


class UnreadCount(APIModel):
    """Threads with at least one unread candidate message."""

    count: int
