"""Interviews: the recruiter's schedule and per-application scheduling."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUserDep, SessionDep
from app.core.enums import InterviewStatus
from app.schemas.interview import InterviewCreate, InterviewListItem, InterviewRead, InterviewUpdate
from app.services import interview_service

router = APIRouter(tags=["interviews"])


@router.get("/interviews", response_model=list[InterviewListItem], summary="Interview schedule")
async def list_interviews(
    session: SessionDep,
    status: InterviewStatus | None = None,
    upcoming: Annotated[bool | None, Query(description="true: future only, false: past only")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[InterviewListItem]:
    """Interviews across the active pipeline, soonest first."""
    return await interview_service.list_interviews(session, status=status, upcoming=upcoming, limit=limit)


@router.patch("/interviews/{interview_id}", response_model=InterviewRead, summary="Update an interview")
async def update_interview(
    interview_id: UUID, body: InterviewUpdate, session: SessionDep, user: CurrentUserDep
) -> InterviewRead:
    """Reschedule, record the candidate's confirmation, complete (with feedback notes) or cancel."""
    return await interview_service.update_interview(session, interview_id, body, user)


@router.get(
    "/applications/{application_id}/interviews",
    response_model=list[InterviewRead],
    summary="An application's interviews",
)
async def list_application_interviews(application_id: UUID, session: SessionDep) -> list[InterviewRead]:
    return await interview_service.list_for_application(session, application_id)


@router.post(
    "/applications/{application_id}/interviews",
    response_model=InterviewRead,
    status_code=201,
    summary="Schedule an interview",
)
async def schedule_interview(
    application_id: UUID, body: InterviewCreate, session: SessionDep, user: CurrentUserDep
) -> InterviewRead:
    """Also records an interview_scheduled timeline entry."""
    return await interview_service.schedule_interview(session, application_id, body, user)
