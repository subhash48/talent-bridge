import json
import uuid

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.base import utcnow
from app.schemas.ai import AskContent, DraftContent, DraftPurpose
from app.services.ai.client import AIProvider, AIProviderError, get_ai_provider
from app.services.ai.context import CandidateContext, build_candidate_context
from app.services.ai.fallback import MockProvider
from app.services.ai.gemini import GeminiProvider
from app.services.ai.groq import GroqProvider
from tests.conftest import API, application_id, candidate_id

SOPHIA = application_id("sophia-martinez")


async def test_ai_never_evaluates_candidates(client: AsyncClient) -> None:
    """No analysis, scoring, strengths or concerns: TalentBridge's AI drafts communication."""
    for path in ("analyze-candidate", "ask-candidate"):
        response = await client.post(f"{API}/ai/{path}", json={"application_id": SOPHIA, "message": "Any concerns?"})
        assert response.status_code in (404, 405)
    ai_paths = [path for path in app.openapi()["paths"] if path.startswith(f"{API}/ai/")]
    assert ai_paths == [f"{API}/ai/draft-message"]
    detail = (await client.get(f"{API}/candidates/{candidate_id('sophia-martinez')}")).json()
    assert "ai_analysis" not in detail


async def test_draft_message(client: AsyncClient) -> None:
    response = await client.post(f"{API}/ai/draft-message", json={"application_id": SOPHIA, "purpose": "follow_up"})
    assert response.status_code == 200
    draft = response.json()
    assert draft["purpose"] == "follow_up"
    assert draft["subject"].startswith("Your design interview")
    assert draft["body"].startswith("Hi Sophia,")
    assert draft["body"].endswith("Best,\nAlex")

    # Drafting never sends anything.
    messages = (await client.get(f"{API}/applications/{SOPHIA}/messages")).json()
    assert len(messages) == 4


async def test_ai_validation(client: AsyncClient) -> None:
    missing = await client.post(
        f"{API}/ai/draft-message", json={"application_id": "00000000-0000-0000-0000-000000000000"}
    )
    assert missing.status_code == 404
    purpose = await client.post(f"{API}/ai/draft-message", json={"application_id": SOPHIA, "purpose": "rejection"})
    assert purpose.status_code == 422


class BrokenProvider(AIProvider):
    """A hosted provider that is down."""

    name = model = "broken"

    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        raise AIProviderError("timed out")

    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        raise AIProviderError("timed out")


async def test_failed_provider_falls_back_to_mock(client: AsyncClient) -> None:
    app.dependency_overrides[get_ai_provider] = BrokenProvider
    response = await client.post(f"{API}/ai/draft-message", json={"application_id": SOPHIA, "purpose": "follow_up"})
    assert response.status_code == 200
    assert response.json()["model_name"] == "mock (fallback from broken)"


# The assistant's status questions (ai_service.ask_candidate), answered offline by the mock


@pytest.mark.parametrize(
    "question",
    [
        "What are the strongest reasons to interview this candidate?",
        "Any concerns?",
        "What are her weaknesses?",
        "Should we hire her?",
        "Is she a good fit?",
        "Rate her out of 10",
    ],
)
async def test_the_mock_declines_to_evaluate(context: CandidateContext, question: str) -> None:
    answer = (await MockProvider().ask_candidate(context, question)).answer
    assert answer.startswith("I don't evaluate candidates")
    assert "Figma" not in answer and "design system" not in answer.lower()


async def test_the_mock_answers_status_questions(context: CandidateContext) -> None:
    status = await MockProvider().ask_candidate(context, "Tell me about Sophia's application")
    assert "**Sophia Martinez**" in status.answer and "**Interview**" in status.answer
    steps = await MockProvider().ask_candidate(context, "What should I do next?")
    assert steps.answer.startswith("Here's what I'd do next for Sophia")
    assert "evidence" not in steps.answer


# Hosted providers, against a fake HTTP transport


@pytest.fixture
async def context(sessions: async_sessionmaker[AsyncSession]) -> CandidateContext:
    async with sessions() as session:
        return await build_candidate_context(
            session, uuid.UUID(SOPHIA), recruiter_name="Alex Chen", organization="Encord", now=utcnow()
        )


async def test_gemini_provider_parses_json_mode(context: CandidateContext) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers["x-goog-api-key"]
        seen["body"] = json.loads(request.content)
        draft = {"subject": "Next steps", "body": "Hi Sophia,\n\nThanks for your time.\n\nBest,\nAlex"}
        reply = {"candidates": [{"content": {"parts": [{"text": json.dumps(draft)}]}}]}
        return httpx.Response(200, json=reply)

    provider = GeminiProvider(api_key="test-key", model="gemini-test", transport=httpx.MockTransport(handler))
    content = await provider.draft_message(context, DraftPurpose.FOLLOW_UP)
    assert content.subject == "Next steps"
    assert seen["key"] == "test-key"
    body = seen["body"]
    assert isinstance(body, dict) and body["generationConfig"]["responseMimeType"] == "application/json"
    assert "Sophia Martinez" in body["contents"][0]["parts"][0]["text"]
    assert "sophia.martinez@example.com" not in json.dumps(body)  # contact details stay out of prompts


async def test_groq_provider_and_error_handling(context: CandidateContext) -> None:
    def ok(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-key"
        draft = {"subject": "Next steps", "body": "Hi Sophia,\n\nThanks!\n\nBest,\nAlex"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(draft)}}]})

    provider = GroqProvider(api_key="test-key", model="llama-test", transport=httpx.MockTransport(ok))
    draft = await provider.draft_message(context, DraftPurpose.FOLLOW_UP)
    assert draft.subject == "Next steps"

    failing = GroqProvider(
        api_key="test-key", model="llama-test", transport=httpx.MockTransport(lambda r: httpx.Response(500))
    )
    try:
        await failing.ask_candidate(context, "Summarize")
    except AIProviderError as exc:
        assert "500" in str(exc)
    else:
        raise AssertionError("expected AIProviderError")
