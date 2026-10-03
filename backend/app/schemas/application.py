"""Application schemas: stage and status enums, staff record, candidate projection (ARCHITECTURE.md 7.2).

Mirrors frontend/types/application.ts. Portal (candidate-facing) models are separate classes in this
file and never include internal fields such as insights, notes or feedback (6.3, 10.2 L4).
"""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class ApplicationStage(StrEnum):
    SOURCED = "sourced"
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    FINAL_INTERVIEW = "final_interview"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"


class ApplicationStatus(StrEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    WITHDRAWN = "withdrawn"
    ARCHIVED = "archived"


class Application(BaseModel):
    """Staff view of an application."""

    id: UUID
    candidate_id: UUID
    job_id: UUID
    owner_id: UUID | None = None
    stage: ApplicationStage
    stage_entered_at: datetime
    status: ApplicationStatus
    updated_at: datetime


class StageChange(BaseModel):
    """Body of PATCH /v1/applications/{application_id}/stage."""

    to: ApplicationStage


class PortalApplication(BaseModel):
    """Candidate projection: job and projected stage only."""

    id: UUID
    job_title: str
    stage: ApplicationStage
