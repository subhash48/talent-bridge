"""The recruiter assistant: typed and spoken requests through one action engine (services/assistant).

Recruiters and admins only (router.py checks the role on the users row, so a candidate's token gets a
403 here whatever the browser shows). Speech is transcribed and the recording discarded; the
transcript goes through exactly the same POST /assistant/requests as typed text. Nothing external
happens until the recruiter confirms a proposal, and each proposal runs at most once.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from app.core.config import settings
from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.core.errors import AppError, BadRequestError, ServiceUnavailableError
from app.schemas.assistant import (
    AssistantHistoryItem,
    AssistantRequest,
    AssistantResponse,
    AssistantStatus,
    ConfirmActionRequest,
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
async def status(provider: AIProviderDep) -> AssistantStatus:
    return AssistantStatus(
        voice_transcription=provider.can_transcribe, jobs=settings.ashby_demo_enabled, model_name=provider.model
    )


@router.post("/requests", response_model=AssistantResponse, summary="Ask the assistant (typed or spoken)")
async def ask(
    body: AssistantRequest, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> AssistantResponse:
    """One request, understood as one structured action. Questions are answered and job drafts written
    straight away; sending a message or publishing a job comes back as a proposal to confirm. The same
    client_request_id again returns the first answer and runs nothing twice."""
    return await engine.handle(session, user, body, provider)


@router.post("/actions/{action_id}/confirm", response_model=AssistantResponse, summary="Confirm a proposal")
async def confirm(
    action_id: UUID, session: SessionDep, user: RecruiterDep, body: ConfirmActionRequest | None = None
) -> AssistantResponse:
    """Runs the proposal through the existing service (sending the message, publishing the job). 409
    action_already_handled if it was already confirmed, cancelled or failed: one confirmation, one send.
    A failure comes back with status failed and the reason; nothing is reported as done unless it was."""
    return await engine.confirm(session, user, action_id, body.body if body else None)


@router.post("/actions/{action_id}/cancel", status_code=204, summary="Dismiss a proposal")
async def cancel(action_id: UUID, session: SessionDep, user: RecruiterDep) -> Response:
    await engine.cancel(session, user, action_id)
    return Response(status_code=204)


@router.get("/actions", response_model=list[AssistantHistoryItem], summary="Recent actions")
async def recent(
    session: SessionDep, user: RecruiterDep, limit: Annotated[int, Query(ge=1, le=50)] = 20
) -> list[AssistantHistoryItem]:
    """What the assistant did for you, newest first: messages sent, jobs drafted, changed and
    published, and anything that failed."""
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


async def _vocabulary(session: SessionDep) -> str:
    """Candidate names and job titles from the active pipeline, so the transcript spells them as they
    are. Names only: nothing else about anyone."""
    applications = await active_applications(session)
    names = list(dict.fromkeys(app.candidate.full_name for app in applications))[:60]
    titles = list(dict.fromkeys(app.job.title for app in applications))[:20]
    return f"Candidates: {', '.join(names)}. Jobs: {', '.join(titles)}."
