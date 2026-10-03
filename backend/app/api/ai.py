"""Recruiter AI. It analyses and drafts for a recruiter to review; it never changes a stage,
sends a message or makes a hiring decision."""

from fastapi import APIRouter

from app.core.dependencies import AIProviderDep, RecruiterDep, SessionDep
from app.schemas.ai import (
    AIAnalysisRead,
    AnalyzeCandidateRequest,
    AskCandidateRequest,
    AskCandidateResponse,
    DraftMessageRequest,
    DraftMessageResponse,
)
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/analyze-candidate", response_model=AIAnalysisRead, status_code=201, summary="Analyse an application")
async def analyze_candidate(
    body: AnalyzeCandidateRequest, session: SessionDep, provider: AIProviderDep, user: RecruiterDep
) -> AIAnalysisRead:
    """Gathers the candidate, job, application and activity, asks the configured provider for an
    evidence-based analysis, stores it and records a timeline entry."""
    return await ai_service.analyze_candidate(session, body.application_id, provider, user)


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
