"""Applications: stage changes and archiving."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import RecruiterDep, SessionDep
from app.schemas.application import StageUpdate
from app.schemas.candidate import CandidateListItem
from app.services import application_service

router = APIRouter(prefix="/applications", tags=["applications"])


@router.patch("/{application_id}/stage", response_model=CandidateListItem, summary="Change the stage")
async def update_stage(
    application_id: UUID, body: StageUpdate, session: SessionDep, user: RecruiterDep
) -> CandidateListItem:
    """Updates the application, appends stage history and records a timeline entry. Returns 400
    for a transition the pipeline doesn't allow (for example Screening to Hired)."""
    return await application_service.change_stage(session, application_id, body.stage, user, reason=body.reason)


@router.post("/{application_id}/archive", response_model=CandidateListItem, summary="Archive")
async def archive_application(application_id: UUID, session: SessionDep, user: RecruiterDep) -> CandidateListItem:
    return await application_service.archive(session, application_id, user)


@router.post("/{application_id}/restore", response_model=CandidateListItem, summary="Restore")
async def restore_application(application_id: UUID, session: SessionDep, user: RecruiterDep) -> CandidateListItem:
    return await application_service.restore(session, application_id, user)
