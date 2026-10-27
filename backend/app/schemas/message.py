"""Message schemas: one thread per application."""

from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.core.enums import EmailStatus, MessageKind, SenderType
from app.schemas.common import APIModel, CandidateRef, OptionalText, Timestamp


class MessageCreate(APIModel):
    """A recruiter's message. The AI only drafts; this endpoint is always a person sending."""

    content: Annotated[str, Field(min_length=1, max_length=5000)]
    subject: OptionalText(200) = None  # the email's subject; a plain one is used when blank


class MessageDeliveryRead(APIModel):
    """How a recruiter's message reached the candidate: always the portal, and email when configured."""

    subject: str
    email_status: EmailStatus
    error: str | None = None
    sent_at: Timestamp | None = None


class MessageRead(APIModel):
    id: UUID
    application_id: UUID
    sender_type: SenderType
    content: str
    kind: MessageKind = MessageKind.MESSAGE  # the candidate's own label: a thank-you note, a follow-up
    created_at: Timestamp
    read_at: Timestamp | None = None
    delivery: MessageDeliveryRead | None = None  # a recruiter's message sent from Kavuntra


class Conversation(APIModel):
    candidate: CandidateRef
    unread: int
    messages: list[MessageRead]


class UnreadCount(APIModel):
    """Threads with at least one unread candidate message."""

    count: int
