import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ApplicationStage
from app.models.base import Base, UUIDPrimaryKey, db_enum, utcnow

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job import Job

LOCAL_ONLY = text("external_id IS NULL")


class Application(UUIDPrimaryKey, Base):
    """One candidate's candidacy for one job. The pipeline stage belongs here, not on the person.

    Applications synced from Ashby keep Ashby's raw stage and status next to the stage Talent Bridge
    mapped them to (integrations/ashby/mapping.py), so the mapping can be re-run or audited.
    """

    __tablename__ = "applications"
    __table_args__ = (
        # One application per job for applications made here. Ashby can hold two for the same job
        # (merged duplicate profiles), and each keeps its own Ashby id.
        Index(
            "applications_candidate_job_local_key",
            "candidate_id",
            "job_id",
            unique=True,
            postgresql_where=LOCAL_ONLY,
            sqlite_where=LOCAL_ONLY,
        ),
    )

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

    # Ashby (migration 011). Null for applications created in Talent Bridge.
    external_id: Mapped[str | None] = mapped_column(Text, unique=True)
    external_status: Mapped[str | None] = mapped_column(Text)  # Active, Lead, Hired or Archived
    external_stage_id: Mapped[str | None] = mapped_column(Text)
    external_stage_title: Mapped[str | None] = mapped_column(Text)
    external_stage_type: Mapped[str | None] = mapped_column(Text)
    # Only the reason's type (RejectedByOrg, RejectedByCandidate, Other), never its text.
    external_archive_reason_type: Mapped[str | None] = mapped_column(Text)
    # Ashby's updatedAt for the version applied here; older webhooks never overwrite newer data.
    external_updated_at: Mapped[datetime | None]

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
