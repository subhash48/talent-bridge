import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, LargeBinary, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKey, utcnow


class CandidateResume(UUIDPrimaryKey, Base):
    """A résumé sent with an application on the careers site (migration 016). Recruiters can open it;
    its text grounds the candidate's own interview preparation. The latest one is the candidate's."""

    __tablename__ = "candidate_resumes"
    __table_args__ = (Index("candidate_resumes_candidate_idx", "candidate_id", "created_at"),)

    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    application_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("applications.id", ondelete="SET NULL"))
    file_name: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int]
    sha256: Mapped[str] = mapped_column(Text)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
