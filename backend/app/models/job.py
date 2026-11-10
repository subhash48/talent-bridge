import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import JobSource, JobStatus, JobVisibility, SalaryPeriod, WorkArrangement
from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey, db_enum, text_enum

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
    # A small business's job, in the employer's own words (migration 020). Empty for most full-workspace jobs.
    pay: Mapped[str | None] = mapped_column(Text)  # "$18/hour"
    shift: Mapped[str | None] = mapped_column(Text)  # "Evenings"
    work_days: Mapped[list[str]] = mapped_column(JSONType, default=list)  # Weekday values, Monday first
    openings: Mapped[int | None]  # how many people they're hiring
    # The public job board (migration 022). Who posted it is the employer's workspace mode when it was posted
    # (services/job_service.create_job), never what a request says, and it never changes afterwards.
    posted_by: Mapped[JobSource] = mapped_column(text_enum(JobSource))
    work_arrangement: Mapped[WorkArrangement | None] = mapped_column(text_enum(WorkArrangement))
    salary_min: Mapped[int | None]  # whole units of salary_currency, per salary_period
    salary_max: Mapped[int | None]
    salary_currency: Mapped[str | None] = mapped_column(Text)  # "USD"
    salary_period: Mapped[SalaryPeriod | None] = mapped_column(text_enum(SalaryPeriod))
    # A private job is never on the board, whatever its status.
    visibility: Mapped[JobVisibility] = mapped_column(text_enum(JobVisibility), default=JobVisibility.PUBLIC)
    published_at: Mapped[datetime | None]  # the first time it opened
    expires_at: Mapped[datetime | None]  # after this it leaves the board and takes no applications

    # Joined, so job.company is always there to read, including in async code.
    company: Mapped["Company"] = relationship(back_populates="jobs", lazy="joined")
    applications: Mapped[list["Application"]] = relationship(back_populates="job")
