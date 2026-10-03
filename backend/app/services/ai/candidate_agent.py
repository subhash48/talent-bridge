"""Candidate Assistant: topic detection, permission-scoped context, cited answers and handoff.

Emits ai_question_asked with the topic only, never the transcript (ARCHITECTURE.md 6.2, 6.5, 6.6).
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Principal
from app.schemas.ai import ChatRequest
from app.services.ai.client import LLMChunk


def answer(
    session: AsyncSession, principal: Principal, request: ChatRequest
) -> AsyncIterator[LLMChunk]:
    raise NotImplementedError  # TODO: classify topic, apply policy, retrieve, stream with citations
