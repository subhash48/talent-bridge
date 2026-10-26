"""Recruiter AI for one application: the assistant's status questions about the record, and drafts
of messages to the candidate. It never evaluates or ranks anyone, changes a stage or sends a message:
people send.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.models.base import utcnow
from app.schemas.ai import (
    AskCandidateResponse,
    DraftMessageResponse,
    DraftPurpose,
)
from app.services.ai.client import AIProvider, AIProviderError
from app.services.ai.context import CandidateContext, build_candidate_context
from app.services.ai.fallback import MockProvider

logger = logging.getLogger(__name__)


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


async def candidate_context(session: AsyncSession, application_id: uuid.UUID, actor: User | None) -> CandidateContext:
    """What the AI may know about one application, for drafting and answering about it."""
    return await _context(session, application_id, actor)


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
