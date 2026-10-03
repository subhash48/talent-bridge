"""The candidate portal. Every route acts as the signed-in candidate and only ever sees their own
application, through candidate-safe projections (schemas/portal.py).

Same tables as the recruiter workspace, so changes on either side show on the other at once. A
candidate can confirm interviews, message the hiring team and edit their contact details; they
can't change their stage, their job or anything a recruiter recorded.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.dependencies import AIProviderDep, CurrentCandidateDep, SessionDep
from app.schemas.portal import (
    CandidateApplicationDetail,
    CandidateAskRequest,
    CandidateAskResponse,
    CandidateMe,
    CandidatePrep,
    MessageThread,
    PortalActivity,
    PortalCandidate,
    PortalInterview,
    PortalMessage,
    PortalMessageCreate,
    ProfileUpdate,
    UTCOffset,
)
from app.services import (
    candidate_ai_service,
    candidate_interview_service,
    candidate_message_service,
    candidate_portal_service,
)
from app.services.candidate_visibility import present_candidate

router = APIRouter(prefix="/candidate", tags=["candidate portal"])


@router.get("/me", response_model=CandidateMe, summary="Portal home")
async def me(session: SessionDep, candidate: CurrentCandidateDep) -> CandidateMe:
    """The candidate, their application and job, next interview, unread messages and recent activity."""
    return await candidate_portal_service.get_me(session, candidate)


@router.get("/application", response_model=CandidateApplicationDetail, summary="My application")
async def application(session: SessionDep, candidate: CurrentCandidateDep) -> CandidateApplicationDetail:
    """The application with its pipeline steps, the job, the recruiter and the timeline (oldest first)."""
    return await candidate_portal_service.get_application(session, candidate)


@router.get("/activity", response_model=list[PortalActivity], summary="My activity")
async def activity(
    session: SessionDep, candidate: CurrentCandidateDep, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[PortalActivity]:
    """Candidate-visible timeline entries, newest first. Internal entries are never included."""
    return await candidate_portal_service.list_activity(session, candidate, limit=limit)


@router.get("/interviews", response_model=list[PortalInterview], summary="My interviews")
async def interviews(session: SessionDep, candidate: CurrentCandidateDep) -> list[PortalInterview]:
    """By scheduled time. Interviewer feedback is never included."""
    return await candidate_interview_service.list_interviews(session, candidate)


@router.get("/interviews/{interview_id}", response_model=PortalInterview, summary="An interview")
async def interview(interview_id: UUID, session: SessionDep, candidate: CurrentCandidateDep) -> PortalInterview:
    return await candidate_interview_service.get_interview(session, candidate, interview_id)


@router.patch("/interviews/{interview_id}/confirm", response_model=PortalInterview, summary="Confirm an interview")
async def confirm_interview(interview_id: UUID, session: SessionDep, candidate: CurrentCandidateDep) -> PortalInterview:
    """Records the confirmation on the interview and the recruiter's timeline. Idempotent."""
    return await candidate_interview_service.confirm_interview(session, candidate, interview_id)


@router.get("/messages", response_model=MessageThread, summary="My messages")
async def messages(session: SessionDep, candidate: CurrentCandidateDep) -> MessageThread:
    """The thread with the hiring team, oldest first."""
    return await candidate_message_service.get_thread(session, candidate)


@router.post("/messages", response_model=PortalMessage, status_code=201, summary="Message the hiring team")
async def send_message(body: PortalMessageCreate, session: SessionDep, candidate: CurrentCandidateDep) -> PortalMessage:
    """Arrives unread in the recruiter's inbox and on their timeline."""
    return await candidate_message_service.send_message(session, candidate, body.content)


@router.post("/messages/read", status_code=204, summary="Mark my messages read")
async def mark_messages_read(session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    await candidate_message_service.mark_read(session, candidate)
    return Response(status_code=204)


@router.get("/profile", response_model=PortalCandidate, summary="My profile")
async def profile(candidate: CurrentCandidateDep) -> PortalCandidate:
    return present_candidate(candidate)


@router.patch("/profile", response_model=PortalCandidate, summary="Update my profile")
async def update_profile(body: ProfileUpdate, session: SessionDep, candidate: CurrentCandidateDep) -> PortalCandidate:
    """Phone, location, headline and skills only; any other field is a 422."""
    return await candidate_portal_service.update_profile(session, candidate, body)


@router.get("/prep", response_model=CandidatePrep, summary="Interview prep")
async def prep(
    session: SessionDep,
    candidate: CurrentCandidateDep,
    provider: AIProviderDep,
    utc_offset_minutes: UTCOffset | None = None,
) -> CandidatePrep:
    """Preparation for the next interview from the candidate assistant, using candidate-safe context only."""
    return await candidate_ai_service.prepare(session, candidate, provider, utc_offset_minutes=utc_offset_minutes)


@router.post("/prep/viewed", status_code=204, summary="Record that I opened interview prep")
async def prep_viewed(session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    await candidate_ai_service.record_prep_viewed(session, candidate)
    return Response(status_code=204)


@router.post("/ai/ask", response_model=CandidateAskResponse, summary="Ask the candidate assistant")
async def ask(
    body: CandidateAskRequest, session: SessionDep, candidate: CurrentCandidateDep, provider: AIProviderDep
) -> CandidateAskResponse:
    """Answers from the candidate's own record. The recruiter sees the topic, never the question."""
    return await candidate_ai_service.ask(
        session, candidate, body.message, provider, utc_offset_minutes=body.utc_offset_minutes
    )
