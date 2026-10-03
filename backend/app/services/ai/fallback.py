"""Template provider: deterministic, offline answers built from the same context blocks.

Used in tests, when no API key is set, and as the automatic fallback when a provider fails, so the
demo can't fail on stage (ARCHITECTURE.md 6.8).
"""

from collections.abc import AsyncIterator

from app.services.ai.client import LLMChunk, LLMRequest, LLMResult


class TemplateProvider:
    name = "template"

    def stream(self, request: LLMRequest) -> AsyncIterator[LLMChunk]:
        raise NotImplementedError  # TODO: stream the composed answer in chunks

    async def complete(self, request: LLMRequest) -> LLMResult:
        raise NotImplementedError  # TODO: compose the answer from the request's context blocks
