"""Recruiter Copilot: name resolution, staff context and grounded streamed answers.

The MVP pre-assembles context instead of running a tool loop. It never sends anything: drafts are
proposals for a human (ARCHITECTURE.md 6.2, 6.4, 6.7).
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Principal
from app.schemas.ai import ChatRequest
from app.services.ai.client import LLMChunk


def answer(
    session: AsyncSession, principal: Principal, request: ChatRequest
) -> AsyncIterator[LLMChunk]:
    raise NotImplementedError  # TODO: resolve names, build staff context, stream with sources
