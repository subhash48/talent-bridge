from typing import TYPE_CHECKING

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONType, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.application import Application


class Candidate(UUIDPrimaryKey, Timestamps, Base):
    """The person. Their stage, activity and interviews live on each Application."""

    __tablename__ = "candidates"

    external_id: Mapped[str | None] = mapped_column(Text, unique=True)  # Ashby candidate id
    first_name: Mapped[str] = mapped_column(Text)
    last_name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)  # always stored lowercase
    phone: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    headline: Mapped[str | None] = mapped_column(Text)
    resume_url: Mapped[str | None] = mapped_column(Text)
    pronouns: Mapped[str | None] = mapped_column(Text)
    skills: Mapped[list[str]] = mapped_column(JSONType, default=list)

    applications: Mapped[list["Application"]] = relationship(back_populates="candidate", passive_deletes=True)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
