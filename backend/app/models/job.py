from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import JobStatus
from app.models.base import Base, Timestamps, UUIDPrimaryKey, db_enum

if TYPE_CHECKING:
    from app.models.application import Application


class Job(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "jobs"

    external_id: Mapped[str | None] = mapped_column(Text, unique=True)  # Ashby job id
    external_updated_at: Mapped[datetime | None]  # Ashby's updatedAt for the version applied here
    title: Mapped[str] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[JobStatus] = mapped_column(db_enum(JobStatus, "job_status"), default=JobStatus.DRAFT)
    employment_type: Mapped[str] = mapped_column(Text, default="Full-time")
    hiring_manager: Mapped[str | None] = mapped_column(Text)

    applications: Mapped[list["Application"]] = relationship(back_populates="job")
