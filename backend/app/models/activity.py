import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, UUIDPrimaryKey, utcnow


class CandidateActivity(UUIDPrimaryKey, Base):
    """Append-only timeline of an application: stage moves, interviews, messages, AI analysis."""

    __tablename__ = "candidate_activity"
    __table_args__ = (Index("candidate_activity_application_idx", "application_id", "created_at"),)

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    activity_type: Mapped[str] = mapped_column(Text)  # an ActivityType value
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    # "metadata" is reserved on declarative classes, so the attribute is named meta.
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONType)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
