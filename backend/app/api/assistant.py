"""The recruiter assistant: typed and spoken requests through one action engine (services/assistant).

Recruiters and admins only (router.py checks the role on the users row, so a candidate's token gets a
403 here whatever the browser shows). Speech is transcribed and the recording discarded; the
transcript goes through exactly the same POST /assistant/requests as typed text, and the Candidates
page's outreach button through the same engine too. Nothing external happens until the recruiter
confirms a proposal, and each proposal runs at most once.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import AIProviderDep, CalendarProviderDep, EmailProviderDep, RecruiterDep, SessionDep
from app.core.errors import AppError, BadRequestError, NotFoundError, ServiceUnavailableError
from app.models import Application
from app.schemas.assistant import (
    AssistantContext,
    AssistantHistoryItem,
    AssistantIntent,
    AssistantRequest,
    AssistantResponse,
    AssistantStatus,
    ConfirmActionRequest,
    InterviewDetails,
    OutreachRequest,
    TranscriptionRead,
)
from app.services.ai.client import AIProviderError
from app.services.assistant import engine
from app.services.assistant.resolve import active_applications

router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_AUDIO_BYTES = 8 * 1024 * 1024  # about four minutes of compressed speech; requests are seconds long


class AudioTooLarge(AppError):
    status_code = 413
    code = "audio_too_large"


@router.get("/status", response_model=AssistantStatus, summary="What the assistant can do here")
async def status(provider: AIProviderDep, email: EmailProviderDep, calendar: CalendarProviderDep) -> AssistantStatus:
    return AssistantStatus(
        voice_transcription=provider.can_transcribe,
        model_name=provider.model,
        email_configured=email.configured,
        calendar_configured=calendar.configured,
    )


@router.post("/requests", response_model=AssistantResponse, summary="Ask the assistant (typed or spoken)")
async def ask(
    body: AssistantRequest,
    session: SessionDep,
    provider: AIProviderDep,
    user: RecruiterDep,
    email: EmailProviderDep,
    calendar: CalendarProviderDep,
) -> AssistantResponse:
    """One request, understood as one structured action. Questions are answered and candidate lists shown
    straight away; a message, outreach to the candidates ticked, interview times or a new job come back as a
    proposal. Proposals run only once the recruiter approves them, after a final look (a spoken "yes" to
    that counts). The same client_request_id again returns the first answer and runs nothing twice."""
    return await engine.handle(session, user, body, provider, email, calendar)


@router.post("/outreach", response_model=AssistantResponse, summary="Draft personalized outreach")
async def draft_outreach(
    body: OutreachRequest,
    session: SessionDep,
    provider: AIProviderDep,
    user: RecruiterDep,
    email: EmailProviderDep,
    calendar: CalendarProviderDep,
) -> AssistantResponse:
    """One draft per candidate ticked on the Candidates page (an interview invitation or a message), with
    interview times when a schedule is given: the same proposal the assistant makes, confirmed the same way.
    Nothing is sent or scheduled here. 404 if any of them isn't in the workspace's pipeline."""
    ids = set(body.application_ids)
    if len(set(await session.scalars(select(Application.id).where(Application.id.in_(ids))))) != len(ids):
        raise NotFoundError("Application not found.")
    invitation = body.purpose == "interview_invitation"
    words = body.instructions or ("Interview invitation" if invitation else "Personalized message")
    request = AssistantRequest(
        text=words,
        client_request_id=body.client_request_id,
        context=AssistantContext(selected_application_ids=body.application_ids),
        utc_offset_minutes=body.utc_offset_minutes,
        time_zone=body.time_zone,
    )
    intent = AssistantIntent(
        action="draft_outreach",
        purpose=body.purpose,
        instructions=body.instructions,
        interview=InterviewDetails(**body.schedule.model_dump())
        if body.schedule
        else InterviewDetails()
        if invitation
        else None,
        schedule=body.schedule,
    )
    return await engine.handle(session, user, request, provider, email, calendar, intent=intent)


@router.post("/actions/{action_id}/confirm", response_model=AssistantResponse, summary="Confirm a proposal")
async def confirm(
    action_id: UUID,
    session: SessionDep,
    user: RecruiterDep,
    email: EmailProviderDep,
    calendar: CalendarProviderDep,
    body: ConfirmActionRequest | None = None,
) -> AssistantResponse:
    """Runs the proposal through the existing services: sending the message; creating each interview and
    sending each personalized message, for the candidates still ticked; or creating the job. body carries the
    recruiter's edits. 409 action_already_handled if it was already confirmed, cancelled or failed: one
    confirmation, one send. A failure comes back with status failed and the reason; nothing is reported as
    done unless it was."""
    return await engine.confirm(session, user, action_id, body or ConfirmActionRequest(), email, calendar)


@router.post("/actions/{action_id}/cancel", status_code=204, summary="Dismiss a proposal")
async def cancel(action_id: UUID, session: SessionDep, user: RecruiterDep) -> Response:
    await engine.cancel(session, user, action_id)
    return Response(status_code=204)


@router.get("/actions", response_model=list[AssistantHistoryItem], summary="Recent actions")
async def recent(
    session: SessionDep, user: RecruiterDep, limit: Annotated[int, Query(ge=1, le=50)] = 20
) -> list[AssistantHistoryItem]:
    """What the assistant did for you, newest first: messages and outreach sent, jobs created, and
    anything that failed."""
    return await engine.history(session, user, limit)


@router.post("/transcribe", response_model=TranscriptionRead, summary="Transcribe a spoken request")
async def transcribe(request: Request, session: SessionDep, provider: AIProviderDep) -> TranscriptionRead:
    """The raw recording as the body (audio/webm, audio/ogg, audio/mp4 or audio/wav). It is transcribed
    and discarded: only the text comes back, and nothing is stored. 503 transcription_unavailable when
    no speech-to-text provider is configured (the workspace then uses the browser's own)."""
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("audio/"):
        raise BadRequestError("Send the recording as audio.", code="invalid_audio")
    if not provider.can_transcribe:
        raise ServiceUnavailableError(
            "Voice transcription isn't set up on this server.", code="transcription_unavailable"
        )
    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > MAX_AUDIO_BYTES:
            raise AudioTooLarge("That recording is too long. Keep voice requests under a minute.")
    if not audio:
        raise BadRequestError("The recording was empty.", code="invalid_audio")
    try:
        text = await provider.transcribe(bytes(audio), content_type, await _vocabulary(session))
    except AIProviderError:
        raise ServiceUnavailableError(
            "We couldn't transcribe that just now. Try again, or type your request.", code="transcription_failed"
        ) from None
    return TranscriptionRead(text=text, model_name=settings.groq_transcription_model)


# Words a recruiter says when creating a job or narrowing a list, so speech is spelled as they mean it.
JOB_WORDS = "Create a Senior, Staff or Principal role, hybrid, remote or on-site, full-time, B2B SaaS"


async def _vocabulary(session: SessionDep) -> str:
    """Candidate names, job titles and the skills candidates list, from the active pipeline, so the
    transcript spells them as they are. Names and skills only: nothing else about anyone."""
    applications = await active_applications(session)
    names = list(dict.fromkeys(app.candidate.full_name for app in applications))[:60]
    titles = list(dict.fromkeys(app.job.title for app in applications))[:20]
    counts: dict[str, int] = {}
    for app in applications:
        for skill in app.candidate.skills or []:
            counts[skill] = counts.get(skill, 0) + 1
    skills = sorted(counts, key=lambda skill: -counts[skill])[:30]
    return f"Candidates: {', '.join(names)}. Jobs: {', '.join(titles)}. Skills: {', '.join(skills)}. {JOB_WORDS}."
