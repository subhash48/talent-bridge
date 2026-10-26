"""Applications: stage changes, archiving and candidate messaging."""

from uuid import UUID

from fastapi import APIRouter

from app.core.dependencies import RecruiterDep, SessionDep
from app.schemas.application import BulkMessagingUpdate, MessagingUpdate, StageUpdate
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


@router.put(
    "/{application_id}/messaging", response_model=CandidateListItem, summary="Turn candidate messaging on or off"
)
async def set_messaging(
    application_id: UUID, body: MessagingUpdate, session: SessionDep, user: RecruiterDep
) -> CandidateListItem:
    """Whether the candidate may write to the hiring team about this application. They can always read
    what the team sends; while it's off, their portal says messaging opens when the team enables it."""
    [item] = await application_service.set_messaging(session, [application_id], body.enabled, user)
    return item


@router.post("/messaging", response_model=list[CandidateListItem], summary="Turn messaging on or off for several")
async def set_messaging_for_many(
    body: BulkMessagingUpdate, session: SessionDep, user: RecruiterDep
) -> list[CandidateListItem]:
    """For the applications the recruiter picked, and only those. 404 if any id is unknown; then nothing
    changes."""
    return await application_service.set_messaging(session, body.application_ids, body.enabled, user)
