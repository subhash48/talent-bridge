import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, UUIDPrimaryKey, utcnow


class AIAnalysis(UUIDPrimaryKey, Base):
    """Evidence for recruiter review. It never changes a stage or makes a hiring decision."""

    __tablename__ = "ai_analysis"
    __table_args__ = (Index("ai_analysis_application_idx", "application_id", "created_at"),)

    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    summary: Mapped[str] = mapped_column(Text)
    skills_matched: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    missing_skills: Mapped[list[str]] = mapped_column(JSONType, default=list)
    strengths: Mapped[list[str]] = mapped_column(JSONType, default=list)
    concerns: Mapped[list[str]] = mapped_column(JSONType, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSONType, default=list)
    recommended_next_step: Mapped[str] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
