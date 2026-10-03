"""Recruiter AI: analysis, questions and drafts for one application.

The AI provides evidence for a recruiter to review. Nothing here changes a stage or sends a
message, and an analysis that recommends rejecting someone is replaced with a review step.
"""

import logging
import re
import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType
from app.models import AIAnalysis, User
from app.models.base import utcnow
from app.schemas.ai import (
    AIAnalysisRead,
    AnalysisContent,
    AskCandidateResponse,
    DraftMessageResponse,
    DraftPurpose,
)
from app.services.activity_service import record_activity
from app.services.ai.client import AIProvider, AIProviderError
from app.services.ai.context import CandidateContext, build_candidate_context
from app.services.ai.fallback import MockProvider

logger = logging.getLogger(__name__)

# Hiring decisions belong to people. If a model words its next step as one, replace it.
DECISION_LANGUAGE = re.compile(
    r"\b(reject\w*|declin\w*|disqualif\w*|(do not|don't|not) (hire|proceed|advance|move forward)|not a (good )?fit|unsuitable)\b",
    re.IGNORECASE,
)
REVIEW_STEP = "Review this evidence with the hiring team and agree the next step together."


async def analyze_candidate(
    session: AsyncSession, application_id: uuid.UUID, provider: AIProvider, actor: User | None
) -> AIAnalysisRead:
    context = await _context(session, application_id, actor)
    content, model_name = await with_fallback(provider, lambda p: p.analyze_candidate(context))
    content = enforce_review_policy(content)

    now = utcnow()
    analysis = AIAnalysis(
        application_id=application_id,
        **content.model_dump(mode="json"),
        model_name=model_name,
        created_at=now,
    )
    session.add(analysis)
    await session.flush()
    record_activity(
        session,
        application_id,
        ActivityType.AI_ANALYSIS_GENERATED,
        "AI analysis generated",
        metadata={
            "analysis_id": analysis.id,
            "model": model_name,
            "requested_by": actor.full_name if actor else None,
        },
        at=now,
    )
    await session.commit()
    return AIAnalysisRead.model_validate(analysis)


async def ask_candidate(
    session: AsyncSession, application_id: uuid.UUID, question: str, provider: AIProvider, actor: User | None
) -> AskCandidateResponse:
    context = await _context(session, application_id, actor)
    content, model_name = await with_fallback(provider, lambda p: p.ask_candidate(context, question))
    return AskCandidateResponse(answer=content.answer, sources=content.sources, model_name=model_name)


async def draft_message(
    session: AsyncSession,
    application_id: uuid.UUID,
    purpose: DraftPurpose,
    instructions: str | None,
    provider: AIProvider,
    actor: User | None,
) -> DraftMessageResponse:
    context = await _context(session, application_id, actor)
    content, model_name = await with_fallback(provider, lambda p: p.draft_message(context, purpose, instructions))
    return DraftMessageResponse(subject=content.subject, body=content.body, purpose=purpose, model_name=model_name)


def enforce_review_policy(content: AnalysisContent) -> AnalysisContent:
    if DECISION_LANGUAGE.search(content.recommended_next_step):
        logger.info("Replaced an AI next step that read as a hiring decision.")
        return content.model_copy(update={"recommended_next_step": REVIEW_STEP})
    return content


async def _context(session: AsyncSession, application_id: uuid.UUID, actor: User | None) -> CandidateContext:
    return await build_candidate_context(
        session,
        application_id,
        recruiter_name=actor.full_name if actor else "the recruiting team",
        organization=settings.organization_name,
        now=utcnow(),
    )


async def with_fallback[Result](
    provider: AIProvider, call: Callable[[AIProvider], Awaitable[Result]]
) -> tuple[Result, str]:
    """Call the provider; if a hosted model fails, answer with the mock provider instead."""
    try:
        return await call(provider), provider.model
    except AIProviderError as exc:
        if isinstance(provider, MockProvider):
            raise
        logger.warning("%s failed (%s); answering with the mock provider instead.", provider.name, exc)
        return await call(MockProvider()), f"mock (fallback from {provider.name})"
