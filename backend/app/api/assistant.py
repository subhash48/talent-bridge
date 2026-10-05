"""The recruiter assistant: typed and spoken requests through one action engine (services/assistant).

Recruiters and admins only (router.py checks the role on the users row, so a candidate's token gets a
403 here whatever the browser shows). A transcribed request goes through exactly the same POST
/assistant/requests as typed text. Nothing external happens until the recruiter confirms a proposal,
and each proposal runs at most once.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.config import settings
from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.schemas.assistant import (
    AssistantHistoryItem,
    AssistantRequest,
    AssistantResponse,
    AssistantStatus,
    ConfirmActionRequest,
)
from app.services.assistant import engine

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/status", response_model=AssistantStatus, summary="What the assistant can do here")
async def status(provider: AIProviderDep) -> AssistantStatus:
    return AssistantStatus(voice_transcription=False, jobs=settings.ashby_demo_enabled, model_name=provider.model)


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
