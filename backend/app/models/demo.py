"""The development-only demo careers site (migration 013): recruiter-created demo job postings, and the
applications made on /demo/careers before and after they are submitted (services/demo_careers.py).
The API refuses every demo route unless ENABLE_ASHBY_DEMO=true outside production, so in production
these tables stay empty.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, LargeBinary, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import DemoApplicationStatus, DemoPostingStatus
from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey, text_enum, utcnow

if TYPE_CHECKING:
    from app.models.job import Job


class DemoJobPosting(Timestamps, Base):
    """A demo job's posting. The job itself is an ordinary jobs row with a tb-demo- Ashby id, so its
    pipeline, candidates and AI analysis work as for any job; this holds what the careers site shows
    and whether it is listed there. status is the posting's, never the job's (JobStatus)."""

    __tablename__ = "demo_job_postings"
    __table_args__ = (Index("demo_job_postings_status_idx", "status"),)

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[DemoPostingStatus] = mapped_column(text_enum(DemoPostingStatus), default=DemoPostingStatus.DRAFT)
    work_arrangement: Mapped[str | None] = mapped_column(Text)  # On-site, Hybrid or Remote
    seniority: Mapped[str | None] = mapped_column(Text)
    skills: Mapped[list[str]] = mapped_column(JSONType, default=list)
    notes: Mapped[str | None] = mapped_column(Text)  # the recruiter's brief for the AI; never public
    summary: Mapped[str | None] = mapped_column(Text)
    about_role: Mapped[str | None] = mapped_column(Text)
    responsibilities: Mapped[list[str]] = mapped_column(JSONType, default=list)
    requirements: Mapped[list[str]] = mapped_column(JSONType, default=list)
    preferred_qualifications: Mapped[list[str]] = mapped_column(JSONType, default=list)
    about_team: Mapped[str | None] = mapped_column(Text)
    # The pay range the recruiter set (migration 014), in whole units of salary_currency a year. The
    # AI job writer never sets or invents it.
    salary_min: Mapped[int | None]
    salary_max: Mapped[int | None]
    salary_currency: Mapped[str] = mapped_column(Text, default="USD", server_default="USD")
    # The model that drafted the text, when the AI job writer did; the recruiter may have edited it.
    generated_by_model: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    published_at: Mapped[datetime | None]  # the latest publish
    closed_at: Mapped[datetime | None]

    job: Mapped["Job"] = relationship(lazy="joined", innerjoin=True)


class DemoApplication(UUIDPrimaryKey, Timestamps, Base):
    """An application made on the demo careers site, with the applicant's details and résumé.

    It isn't submitted to the hiring team until the applicant proves they own the email: by
    accepting their portal invitation, or by signing in to the account they already have. Only then
    is it delivered through the Ashby simulator, which creates the candidate and the application
    recruiters see (application_id). One per email and job.
    """

    __tablename__ = "demo_applications"
    __table_args__ = (
        UniqueConstraint("email", "job_id", name="demo_applications_email_job_key"),
        Index("demo_applications_auth_user_idx", "auth_user_id"),
    )

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(Text)  # always stored lowercase
    first_name: Mapped[str] = mapped_column(Text)
    last_name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    linkedin_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[DemoApplicationStatus] = mapped_column(
        text_enum(DemoApplicationStatus), default=DemoApplicationStatus.AWAITING_ACTIVATION
    )
    # The Supabase Auth account invited for this email, or found for it, when known.
    auth_user_id: Mapped[uuid.UUID | None]
    invited_at: Mapped[datetime | None]
    invite_error: Mapped[str | None] = mapped_column(Text)  # a safe summary, never a provider response
    finalizing_at: Mapped[datetime | None]  # a submission in flight (a short lease)
    submitted_at: Mapped[datetime | None]
    application_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("applications.id", ondelete="SET NULL"))
    resume_file_name: Mapped[str] = mapped_column(Text)
    resume_content_type: Mapped[str] = mapped_column(Text)
    resume_size_bytes: Mapped[int]
    resume_sha256: Mapped[str] = mapped_column(Text)


class DemoResume(Base):
    """The résumé file of a demo application, kept apart so lists never load it. Private: only the
    API reads it, and only for recruiters once the application has been submitted."""

    __tablename__ = "demo_resumes"

    demo_application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demo_applications.id", ondelete="CASCADE"), primary_key=True
    )
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
