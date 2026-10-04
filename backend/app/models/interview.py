import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import InterviewStatus, InterviewType
from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey, db_enum


class Interview(UUIDPrimaryKey, Timestamps, Base):
    """One interview. Interviews synced from Ashby are one row per Ashby interview event."""

    __tablename__ = "interviews"
    __table_args__ = (Index("interviews_application_idx", "application_id", "scheduled_at"),)

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    interview_type: Mapped[InterviewType] = mapped_column(
        db_enum(InterviewType, "interview_type"), default=InterviewType.VIDEO
    )
    scheduled_at: Mapped[datetime] = mapped_column(index=True)
    duration_minutes: Mapped[int] = mapped_column(default=60)
    status: Mapped[InterviewStatus] = mapped_column(
        db_enum(InterviewStatus, "interview_status"), default=InterviewStatus.SCHEDULED
    )
    meeting_url: Mapped[str | None] = mapped_column(Text)
    # Interviewer feedback. A completed interview without notes is waiting on feedback.
    notes: Mapped[str | None] = mapped_column(Text)
    interviewers: Mapped[list[str]] = mapped_column(JSONType, default=list)
    confirmed_at: Mapped[datetime | None]

    # Ashby (migration 011): the interview event id, its schedule, and the version applied here.
    # Null for interviews scheduled in Talent Bridge, which are never pushed to Ashby.
    external_id: Mapped[str | None] = mapped_column(Text, unique=True)
    external_schedule_id: Mapped[str | None] = mapped_column(Text, index=True)
    external_updated_at: Mapped[datetime | None]
