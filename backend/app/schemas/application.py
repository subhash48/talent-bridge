"""Application schemas: the stage record and stage changes."""

from uuid import UUID

from app.core.enums import ApplicationStage
from app.schemas.common import APIModel, OptionalText, Timestamp


class ApplicationRead(APIModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    stage: ApplicationStage
    source: str | None = None
    applied_at: Timestamp
    updated_at: Timestamp
    archived_at: Timestamp | None = None


class ApplicationBrief(APIModel):
    """One of a candidate's applications, for switching between them."""

    id: UUID
    job_id: UUID
    job_title: str
    stage: ApplicationStage
    archived: bool


class StageUpdate(APIModel):
    """Body of PATCH /applications/{application_id}/stage."""

    stage: ApplicationStage
    reason: OptionalText(500) = None


class StageHistoryRead(APIModel):
    id: UUID
    previous_stage: ApplicationStage | None = None
    new_stage: ApplicationStage
    changed_by: UUID | None = None
    changed_at: Timestamp
