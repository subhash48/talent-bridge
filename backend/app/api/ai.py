"""Recruiter AI. It drafts messages to a candidate for a recruiter to edit and send; it never evaluates
candidates, changes a stage, sends a message or makes a hiring decision."""

from fastapi import APIRouter

from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.schemas.ai import DraftMessageRequest, DraftMessageResponse
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/draft-message", response_model=DraftMessageResponse, summary="Draft a message")
async def draft_message(
    body: DraftMessageRequest, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> DraftMessageResponse:
    """A draft for the recruiter to edit and send. Nothing is sent."""
    return await ai_service.draft_message(session, body.application_id, body.purpose, body.instructions, provider, user)
