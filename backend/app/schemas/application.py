"""Application schemas: the stage record and stage changes."""

from typing import Literal
from uuid import UUID

from pydantic import computed_field

from app.core.enums import ApplicationStage
from app.schemas.common import APIModel, OptionalText, Timestamp

# Where the application came from: synced from Ashby (the system of record) or made here.
Origin = Literal["ashby", "talent_bridge"]


def origin_of(external_id: str | None) -> Origin:
    return "ashby" if external_id else "talent_bridge"


class ApplicationRead(APIModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    stage: ApplicationStage
    source: str | None = None
    applied_at: Timestamp
    updated_at: Timestamp
    archived_at: Timestamp | None = None
    # Ashby's own view of it, for recruiters (null for applications made in Talent Bridge).
    external_id: str | None = None
    external_status: str | None = None
    external_stage_title: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def origin(self) -> Origin:
        return origin_of(self.external_id)


class ApplicationBrief(APIModel):
    """One of a candidate's applications, for switching between them."""

    id: UUID
    job_id: UUID
    job_title: str
    stage: ApplicationStage
    archived: bool
    origin: Origin


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
