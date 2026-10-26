import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import CommunicationRuleKey, DraftStatus, EmailStatus
from app.models.base import Base, Timestamps, UUIDPrimaryKey, text_enum, utcnow


class CommunicationRule(Base):
    """A workspace's change to one SLA rule (migrations 015 and 019). Rules without a row use their
    defaults (services/communication/rules.py)."""

    __tablename__ = "communication_rules"

    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[CommunicationRuleKey] = mapped_column(text_enum(CommunicationRuleKey), primary_key=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    # Hours since the event, or for interview_unconfirmed, hours before the interview.
    threshold_hours: Mapped[int]
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, server_default=func.now())


class CommunicationDraft(UUIDPrimaryKey, Timestamps, Base):
    """An update the AI drafted for a recruiter to edit, approve and send (migration 015). Never sent
    automatically. ai_subject and ai_body keep what the AI wrote."""

    __tablename__ = "communication_drafts"
    __table_args__ = (
        Index("communication_drafts_application_idx", "application_id", "created_at"),
        Index("communication_drafts_status_idx", "status", "created_at"),
    )

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(Text)  # a CommunicationRuleKey value, or "manual"
    status: Mapped[DraftStatus] = mapped_column(text_enum(DraftStatus), default=DraftStatus.DRAFTED)
    subject: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    ai_subject: Mapped[str] = mapped_column(Text)
    ai_body: Mapped[str] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(Text)
    message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    sent_at: Mapped[datetime | None]
    discarded_at: Mapped[datetime | None]


class MessageDelivery(Base):
    """How a recruiter's message reached the candidate (migration 015). The message row is the portal
    delivery; this is the email: pending, sent, failed, or not configured (portal only)."""

    __tablename__ = "message_deliveries"
    __table_args__ = (Index("message_deliveries_draft_idx", "draft_id"),)

    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    subject: Mapped[str] = mapped_column(Text)
    email_status: Mapped[EmailStatus] = mapped_column(text_enum(EmailStatus))
    provider: Mapped[str | None] = mapped_column(Text)
    provider_message_id: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)  # safe to show the recruiter; never a key or a body
    draft_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("communication_drafts.id", ondelete="SET NULL"))
    attempted_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    sent_at: Mapped[datetime | None]
