"""Application schemas: the stage record, stage changes and candidate messaging."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, computed_field

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
    candidate_messaging_enabled: bool = False  # the candidate may write to the hiring team about it
    # Ashby's own view of it, for recruiters (null for applications made in TalentBridge).
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


class MessagingUpdate(APIModel):
    """Body of PUT /applications/{application_id}/messaging."""

    enabled: bool


class BulkMessagingUpdate(APIModel):
    """Body of POST /applications/messaging: the applications the recruiter picked, and nothing else."""

    application_ids: Annotated[list[UUID], Field(min_length=1, max_length=200)]
    enabled: bool


class StageHistoryRead(APIModel):
    id: UUID
    previous_stage: ApplicationStage | None = None
    new_stage: ApplicationStage
    changed_by: UUID | None = None
    changed_at: Timestamp
