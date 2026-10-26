from datetime import datetime

from sqlalchemy import Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ContactTopic
from app.models.base import Base, UUIDPrimaryKey, text_enum, utcnow


class ContactRequest(UUIDPrimaryKey, Base):
    """A message sent with the public website's contact form (migration 021). Kept whether or not it could
    be emailed to the team, so nothing sent is lost."""

    __tablename__ = "contact_requests"

    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    company: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[ContactTopic] = mapped_column(text_enum(ContactTopic))
    message: Mapped[str] = mapped_column(Text)
    email_status: Mapped[str] = mapped_column(Text, default="not_configured")  # sent, failed or not_configured
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
