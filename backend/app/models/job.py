import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import JobStatus
from app.models.base import Base, Timestamps, UUIDPrimaryKey, db_enum

if TYPE_CHECKING:
    from app.models.application import Application
    from app.models.company import Company


class Job(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "jobs"

    # The employer (migration 017). A candidate's company is always application -> job -> company.
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    external_id: Mapped[str | None] = mapped_column(Text, unique=True)  # Ashby job id
    external_updated_at: Mapped[datetime | None]  # Ashby's updatedAt for the version applied here
    title: Mapped[str] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[JobStatus] = mapped_column(db_enum(JobStatus, "job_status"), default=JobStatus.DRAFT)
    employment_type: Mapped[str] = mapped_column(Text, default="Full-time")
    hiring_manager: Mapped[str | None] = mapped_column(Text)

    # Joined, so job.company is always there to read, including in async code.
    company: Mapped["Company"] = relationship(back_populates="jobs", lazy="joined")
    applications: Mapped[list["Application"]] = relationship(back_populates="job")
