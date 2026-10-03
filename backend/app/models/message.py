import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SenderType
from app.models.base import Base, UUIDPrimaryKey, db_enum, utcnow


class Message(UUIDPrimaryKey, Base):
    """One message in an application's thread. The AI only drafts; people send."""

    __tablename__ = "messages"
    __table_args__ = (Index("messages_application_idx", "application_id", "created_at"),)

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    sender_type: Mapped[SenderType] = mapped_column(db_enum(SenderType, "message_sender_type"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    # When a recruiter read a candidate's message; null means unread.
    read_at: Mapped[datetime | None]
