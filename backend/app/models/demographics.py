"""Voluntary demographic information (migration 014), kept apart from every candidate record.

Each question is optional (null when unanswered) and has its own "prefer not to say". Only the
candidate reads or changes their own answers (/candidate/demographics); recruiters only ever see
aggregates with small groups suppressed (services/demographics.py). No other model, schema, AI
context, search, sort or filter refers to these tables.
"""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, utcnow


class _Answers:
    region: Mapped[str | None] = mapped_column(Text)  # a Region value
    race_ethnicity: Mapped[str | None] = mapped_column(Text)  # a RaceEthnicity value
    disability_status: Mapped[str | None] = mapped_column(Text)  # a DisabilityStatus value
    sexual_orientation: Mapped[str | None] = mapped_column(Text)  # a SexualOrientation value


class CandidateDemographics(_Answers, Timestamps, Base):
    """One candidate's own answers."""

    __tablename__ = "candidate_demographics"

    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True)


class DemoApplicationDemographics(_Answers, Base):
    """Answers given on the demo careers site, held until the application is submitted. Then they move
    to the candidate's own answers and this row is deleted."""

    __tablename__ = "demo_application_demographics"

    demo_application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demo_applications.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
