import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ApplicationStage
from app.models.base import Base, UUIDPrimaryKey, db_enum, utcnow

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job import Job


class Application(UUIDPrimaryKey, Base):
    """One candidate's candidacy for one job. The pipeline stage belongs here, not on the person."""

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("candidate_id", "job_id", name="applications_candidate_job_key"),)

    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="RESTRICT"), index=True)
    stage: Mapped[ApplicationStage] = mapped_column(
        db_enum(ApplicationStage, "application_stage"), default=ApplicationStage.SOURCED, index=True
    )
    source: Mapped[str | None] = mapped_column(Text)
    applied_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, server_default=func.now())
    # Archived applications leave the active pipeline but keep their history.
    archived_at: Mapped[datetime | None]

    candidate: Mapped["Candidate"] = relationship(back_populates="applications")
    job: Mapped["Job"] = relationship(back_populates="applications")


class CandidateStageHistory(UUIDPrimaryKey, Base):
    """Append-only record of every stage an application has been in."""

    __tablename__ = "candidate_stage_history"
    __table_args__ = (Index("candidate_stage_history_application_idx", "application_id", "changed_at"),)

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    previous_stage: Mapped[ApplicationStage | None] = mapped_column(db_enum(ApplicationStage, "application_stage"))
    new_stage: Mapped[ApplicationStage] = mapped_column(db_enum(ApplicationStage, "application_stage"))
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
