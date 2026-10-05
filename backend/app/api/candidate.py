"""The candidate portal. Every route acts as the signed-in candidate and only ever sees their own
applications, through candidate-safe projections (schemas/portal.py).

A candidate can have several applications. Routes that work on one take an optional application_id
(the query string, or the body for POSTs); it must be one of the candidate's own, or the answer is
404. Without it they use the application the portal opens on: the most recently updated active one.

Same tables as the recruiter workspace, so changes on either side show on the other at once. A
candidate can confirm interviews, message the hiring team and edit their contact details; they
can't change their stage, their job or anything a recruiter recorded.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.dependencies import AIProviderDep, CurrentCandidateDep, SessionDep
from app.schemas.demographics import CandidateDemographicsRead, DemographicAnswers
from app.schemas.portal import (
    CandidateApplicationDetail,
    CandidateAskRequest,
    CandidateAskResponse,
    CandidateMe,
    CandidatePrep,
    MessageThread,
    PortalActivity,
    PortalApplicationSummary,
    PortalCandidate,
    PortalCompany,
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
    demographics,
)
from app.services.candidate_visibility import present_candidate
from app.services.company_profile import company_profile

router = APIRouter(prefix="/candidate", tags=["candidate portal"])

ApplicationParam = Annotated[UUID | None, Query(description="One of your applications; default: the latest active one")]


@router.get("/me", response_model=CandidateMe, summary="Portal home")
async def me(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> CandidateMe:
    """The candidate, all their applications, and the selected one's job, next interview, unread
    messages and recent activity."""
    return await candidate_portal_service.get_me(session, candidate, application_id)


@router.get("/applications", response_model=list[PortalApplicationSummary], summary="My applications")
async def applications(session: SessionDep, candidate: CurrentCandidateDep) -> list[PortalApplicationSummary]:
    """Every application, active first, each with its status: active, inactive or no longer under
    consideration."""
    return await candidate_portal_service.list_applications(session, candidate)


@router.get("/applications/{application_id}", response_model=CandidateApplicationDetail, summary="An application")
async def application_detail(
    application_id: UUID, session: SessionDep, candidate: CurrentCandidateDep
) -> CandidateApplicationDetail:
    """404 unless it's one of the candidate's own applications."""
    return await candidate_portal_service.get_application(session, candidate, application_id)


@router.get("/application", response_model=CandidateApplicationDetail, summary="My current application")
async def application(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> CandidateApplicationDetail:
    """The application with its pipeline steps, the job, the recruiter and the timeline (oldest first)."""
    return await candidate_portal_service.get_application(session, candidate, application_id)


@router.get("/activity", response_model=list[PortalActivity], summary="My activity")
async def activity(
    session: SessionDep,
    candidate: CurrentCandidateDep,
    application_id: ApplicationParam = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[PortalActivity]:
    """Candidate-visible timeline entries, newest first. Internal entries are never included."""
    return await candidate_portal_service.list_activity(session, candidate, application_id=application_id, limit=limit)


@router.get("/interviews", response_model=list[PortalInterview], summary="My interviews")
async def interviews(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> list[PortalInterview]:
    """By scheduled time. Interviewer feedback is never included."""
    return await candidate_interview_service.list_interviews(session, candidate, application_id)


@router.get("/interviews/{interview_id}", response_model=PortalInterview, summary="An interview")
async def interview(interview_id: UUID, session: SessionDep, candidate: CurrentCandidateDep) -> PortalInterview:
    return await candidate_interview_service.get_interview(session, candidate, interview_id)


@router.patch("/interviews/{interview_id}/confirm", response_model=PortalInterview, summary="Confirm an interview")
async def confirm_interview(interview_id: UUID, session: SessionDep, candidate: CurrentCandidateDep) -> PortalInterview:
    """Records the confirmation on the interview and the recruiter's timeline. Idempotent."""
    return await candidate_interview_service.confirm_interview(session, candidate, interview_id)


@router.get("/messages", response_model=MessageThread, summary="My messages")
async def messages(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> MessageThread:
    """The thread with the hiring team about one application, oldest first."""
    return await candidate_message_service.get_thread(session, candidate, application_id)


@router.post("/messages", response_model=PortalMessage, status_code=201, summary="Message the hiring team")
async def send_message(body: PortalMessageCreate, session: SessionDep, candidate: CurrentCandidateDep) -> PortalMessage:
    """Arrives unread in the recruiter's inbox and on their timeline. kind is the candidate's own
    label for it (a thank-you note, a follow-up, a question)."""
    return await candidate_message_service.send_message(
        session, candidate, body.content, kind=body.kind, application_id=body.application_id
    )


@router.post("/messages/read", status_code=204, summary="Mark my messages read")
async def mark_messages_read(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> Response:
    await candidate_message_service.mark_read(session, candidate, application_id)
    return Response(status_code=204)


@router.get("/profile", response_model=PortalCandidate, summary="My profile")
async def profile(candidate: CurrentCandidateDep) -> PortalCandidate:
    return present_candidate(candidate)


@router.patch("/profile", response_model=PortalCandidate, summary="Update my profile")
async def update_profile(body: ProfileUpdate, session: SessionDep, candidate: CurrentCandidateDep) -> PortalCandidate:
    """Phone, location, headline and skills only; any other field is a 422."""
    return await candidate_portal_service.update_profile(session, candidate, body)


@router.get("/demographics", response_model=CandidateDemographicsRead, summary="My voluntary demographic information")
async def get_demographics(session: SessionDep, candidate: CurrentCandidateDep) -> CandidateDemographicsRead:
    """Your own answers, null where you left a question blank. Only you can read them: the hiring team
    sees aggregates of everyone's answers, never yours."""
    return await demographics.get_own(session, candidate)


@router.put(
    "/demographics", response_model=CandidateDemographicsRead, summary="Update my voluntary demographic information"
)
async def put_demographics(
    body: DemographicAnswers, session: SessionDep, candidate: CurrentCandidateDep
) -> CandidateDemographicsRead:
    """Replaces your answers. Every question is optional: send null to leave it blank, or
    prefer_not_to_say. Used only in aggregate, never in hiring decisions."""
    return await demographics.save_own(session, candidate, body)


@router.get("/company", response_model=PortalCompany, summary="About the company")
async def company(_candidate: CurrentCandidateDep) -> PortalCompany:
    """What the company shares with candidates: what it does, its mission, products, culture, benefits,
    offices, how hiring works and useful links. The same profile the candidate assistant answers from."""
    return PortalCompany.model_validate(company_profile())


@router.get("/prep", response_model=CandidatePrep, summary="Interview prep")
async def prep(
    session: SessionDep,
    candidate: CurrentCandidateDep,
    provider: AIProviderDep,
    utc_offset_minutes: UTCOffset | None = None,
    application_id: ApplicationParam = None,
) -> CandidatePrep:
    """Preparation for the next interview from the candidate assistant, using candidate-safe context only."""
    return await candidate_ai_service.prepare(
        session, candidate, provider, utc_offset_minutes=utc_offset_minutes, application_id=application_id
    )


@router.post("/prep/viewed", status_code=204, summary="Record that I opened interview prep")
async def prep_viewed(
    session: SessionDep, candidate: CurrentCandidateDep, application_id: ApplicationParam = None
) -> Response:
    await candidate_ai_service.record_prep_viewed(session, candidate, application_id)
    return Response(status_code=204)


@router.post("/ai/ask", response_model=CandidateAskResponse, summary="Ask the candidate assistant")
async def ask(
    body: CandidateAskRequest, session: SessionDep, candidate: CurrentCandidateDep, provider: AIProviderDep
) -> CandidateAskResponse:
    """Answers from the candidate's own record. The recruiter sees the topic, never the question."""
    return await candidate_ai_service.ask(
        session,
        candidate,
        body.message,
        provider,
        utc_offset_minutes=body.utc_offset_minutes,
        application_id=body.application_id,
    )
