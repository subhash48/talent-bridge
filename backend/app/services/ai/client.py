"""Provider-neutral AI interface and provider selection.

Call sites never name a vendor. AI_PROVIDER picks the implementation: mock (default, offline),
gemini or groq. Without the matching API key the mock provider answers, so development and the
demo always work.
"""

import logging
from abc import ABC, abstractmethod
from functools import cache
from typing import TYPE_CHECKING

from app.core.config import settings
from app.schemas.ai import AnalysisContent, AskContent, DraftContent, DraftPurpose
from app.schemas.demo import JobPostingBrief, JobPostingContent
from app.schemas.portal import AssistContent, PrepContent
from app.services.ai.context import CandidateContext
from app.services.ai.portal_context import PortalContext

if TYPE_CHECKING:
    from app.schemas.analytics import AnalyticsInsight
    from app.schemas.assistant import AssistantIntent
    from app.services.analytics.insights import InsightFacts

logger = logging.getLogger(__name__)


class AIProviderError(Exception):
    """The provider failed or returned something unusable."""


class AIProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def analyze_candidate(self, context: CandidateContext) -> AnalysisContent:
        """Evidence for the recruiter: matched and missing skills, strengths, concerns, questions."""

    @abstractmethod
    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        """Answer a recruiter's question about one application, citing the parts of the record used."""

    @abstractmethod
    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        """A message draft for the recruiter to edit and send themselves."""

    # The candidate assistant. It gets a PortalContext, never a CandidateContext, so it can only
    # ever see what the candidate can. A provider without it falls back to the mock provider.

    async def assist_candidate(self, context: PortalContext, question: str) -> AssistContent:
        """Answer the candidate's own question about their application and interviews."""
        raise AIProviderError(f"{self.name} has no candidate assistant")

    async def prepare_candidate(self, context: PortalContext) -> PrepContent:
        """Interview preparation for the candidate's next interview."""
        raise AIProviderError(f"{self.name} has no candidate assistant")

    # The AI job writer, for the development-only demo jobs. It only ever drafts: the recruiter
    # reviews, edits and publishes. A provider without it falls back to the mock provider.

    async def write_job_posting(self, brief: JobPostingBrief, organization: str, overview: str) -> JobPostingContent:
        """A job posting drafted from the recruiter's brief and the company overview, and nothing else."""
        raise AIProviderError(f"{self.name} has no job writer")

    # Portal analytics insights. Only aggregate facts go in; the rules in services/analytics/insights.py
    # answer when a provider has none (the mock) or its answer fails the checks there.

    async def portal_insights(self, facts: "InsightFacts") -> list["AnalyticsInsight"]:
        """At most four insights about the candidate experience, phrased from the facts alone."""
        raise AIProviderError(f"{self.name} has no analytics insights")

    # The recruiter assistant's intent understanding: a request, typed or transcribed, as one
    # structured action (services/assistant). The rules in services/assistant/rules.py read requests
    # when a provider has none (the mock) or it fails.

    async def understand_request(self, text: str, context: str) -> "AssistantIntent":
        """The recruiter's request as a structured action. Never executes anything."""
        raise AIProviderError(f"{self.name} has no intent understanding")


@cache
def _warn_once(message: str) -> None:
    logger.warning(message)


def get_ai_provider() -> AIProvider:
    from app.services.ai.fallback import MockProvider

    choice = settings.ai_provider
    if choice == "gemini":
        if settings.gemini_api_key:
            from app.services.ai.gemini import GeminiProvider

            return GeminiProvider(
                api_key=settings.gemini_api_key.get_secret_value(),
                model=settings.gemini_model,
                timeout=settings.ai_timeout_seconds,
            )
        _warn_once("AI_PROVIDER is gemini but GEMINI_API_KEY is empty; using the mock provider.")
    elif choice == "groq":
        if settings.groq_api_key:
            from app.services.ai.groq import GroqProvider

            return GroqProvider(
                api_key=settings.groq_api_key.get_secret_value(),
                model=settings.groq_model,
                timeout=settings.ai_timeout_seconds,
            )
        _warn_once("AI_PROVIDER is groq but GROQ_API_KEY is empty; using the mock provider.")
    elif choice != "mock":
        _warn_once(f"Unknown AI_PROVIDER {choice!r} (use mock, gemini or groq); using the mock provider.")
    return MockProvider()
