"""Recruiter AI. It answers questions about a record and drafts messages for a recruiter to review; it
never evaluates candidates, changes a stage, sends a message or makes a hiring decision."""

from fastapi import APIRouter

from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.schemas.ai import (
    AskCandidateRequest,
    AskCandidateResponse,
    DraftMessageRequest,
    DraftMessageResponse,
)
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/ask-candidate", response_model=AskCandidateResponse, summary="Ask about a candidate")
async def ask_candidate(
    body: AskCandidateRequest, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> AskCandidateResponse:
    return await ai_service.ask_candidate(session, body.application_id, body.message, provider, user)


@router.post("/draft-message", response_model=DraftMessageResponse, summary="Draft a message")
async def draft_message(
    body: DraftMessageRequest, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> DraftMessageResponse:
    """A draft for the recruiter to edit and send. Nothing is sent."""
    return await ai_service.draft_message(session, body.application_id, body.purpose, body.instructions, provider, user)
