from typing import TYPE_CHECKING, Any

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import WorkspaceMode
from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey, text_enum

if TYPE_CHECKING:
    from app.models.job import Job


class Company(UUIDPrimaryKey, Timestamps, Base):
    """An employer hiring through Kavuntra (migration 017). Every job belongs to one, and a candidate
    learns about a company only through an application to one of its jobs.

    A company is also a workspace (migration 019): the people who hire for it (users.company_id) see its
    jobs and their applicants and nothing else (core/tenancy.py). workspace_mode is how it hires: the full
    recruiting workspace, or Simple Hire.

    The profile fields are what the employer approved for candidates: the portal's Company page shows
    them and the candidate assistant answers company questions from them and nothing else
    (services/company_profile.py). Empty lists and blank text mean the employer hasn't shared that.
    """

    __tablename__ = "companies"

    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    overview: Mapped[str] = mapped_column(Text, default="")
    mission: Mapped[str] = mapped_column(Text, default="")
    highlights: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)  # [{title, description}]
    products: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)  # [{title, description}]
    culture: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)  # values: [{title, description}]
    benefits: Mapped[list[str]] = mapped_column(JSONType, default=list)
    benefits_scope: Mapped[str] = mapped_column(Text, default="")  # who the listed benefits apply to
    benefits_note: Mapped[str] = mapped_column(Text, default="")
    locations: Mapped[list[str]] = mapped_column(JSONType, default=list)
    locations_note: Mapped[str] = mapped_column(Text, default="")
    hiring_process: Mapped[list[str]] = mapped_column(JSONType, default=list)  # the usual stages, in order
    hiring_note: Mapped[str] = mapped_column(Text, default="")
    links: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)  # [{label, url}]
    source: Mapped[str] = mapped_column(Text, default="")  # where the content came from, and when
    workspace_mode: Mapped[WorkspaceMode] = mapped_column(text_enum(WorkspaceMode), default=WorkspaceMode.FULL)

    jobs: Mapped[list["Job"]] = relationship(back_populates="company")
