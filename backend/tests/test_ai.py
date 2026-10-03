import json
import uuid

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.main import app
from app.models.base import utcnow
from app.schemas.ai import AnalysisContent, AskContent, DraftContent, DraftPurpose
from app.services.ai.client import AIProvider, AIProviderError, get_ai_provider
from app.services.ai.context import CandidateContext, build_candidate_context
from app.services.ai.fallback import MockProvider
from app.services.ai.gemini import GeminiProvider
from app.services.ai.groq import GroqProvider
from tests.conftest import API, application_id, candidate_id

SOPHIA = application_id("sophia-martinez")


async def test_analyze_candidate_with_the_mock_provider(client: AsyncClient) -> None:
    response = await client.post(f"{API}/ai/analyze-candidate", json={"application_id": SOPHIA})
    assert response.status_code == 201
    analysis = response.json()
    assert analysis["model_name"] == "mock"
    assert "Sophia Martinez" in analysis["summary"]
    matched = {item["skill"]: item["evidence"] for item in analysis["skills_matched"]}
    assert set(matched) == {"Figma", "Design systems", "Prototyping", "User research"}
    assert matched["Prototyping"].startswith("Portfolio review feedback")  # interview notes beat the profile
    assert analysis["missing_skills"] == ["Interaction design"]
    assert analysis["strengths"] and analysis["suggested_questions"]
    assert "reject" not in analysis["recommended_next_step"].lower()

    detail = (await client.get(f"{API}/candidates/{candidate_id('sophia-martinez')}")).json()
    assert detail["ai_analysis"]["id"] == analysis["id"]
    assert detail["activity"][0]["activity_type"] == "ai_analysis_generated"
    assert detail["stage"] == "interview"  # the AI never changes the stage


async def test_ask_candidate(client: AsyncClient) -> None:
    response = await client.post(
        f"{API}/ai/ask-candidate",
        json={"application_id": SOPHIA, "message": "What are the strongest reasons to interview this candidate?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer"].startswith("The strongest reasons to interview Sophia")
    assert {source["type"] for source in body["sources"]} >= {"profile", "job"}
    assert body["model_name"] == "mock"

    for prompt in ("Summarize candidate", "What are good next steps?", "Prepare an interview brief", "Any concerns?"):
        answer = await client.post(f"{API}/ai/ask-candidate", json={"application_id": SOPHIA, "message": prompt})
        assert answer.status_code == 200 and answer.json()["answer"]


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
        f"{API}/ai/analyze-candidate", json={"application_id": "00000000-0000-0000-0000-000000000000"}
    )
    assert missing.status_code == 404
    empty = await client.post(f"{API}/ai/ask-candidate", json={"application_id": SOPHIA, "message": ""})
    assert empty.status_code == 422
    purpose = await client.post(f"{API}/ai/draft-message", json={"application_id": SOPHIA, "purpose": "rejection"})
    assert purpose.status_code == 422


class DecidingProvider(MockProvider):
    name = model = "deciding"

    async def analyze_candidate(self, context: CandidateContext) -> AnalysisContent:
        content = await super().analyze_candidate(context)
        return content.model_copy(update={"recommended_next_step": "Reject this candidate."})


class BrokenProvider(AIProvider):
    """A hosted provider that is down."""

    name = model = "broken"

    async def analyze_candidate(self, context: CandidateContext) -> AnalysisContent:
        raise AIProviderError("timed out")

    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        raise AIProviderError("timed out")

    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        raise AIProviderError("timed out")


async def test_analysis_never_recommends_rejection(client: AsyncClient) -> None:
    app.dependency_overrides[get_ai_provider] = DecidingProvider
    response = await client.post(f"{API}/ai/analyze-candidate", json={"application_id": SOPHIA})
    assert response.status_code == 201
    assert "reject" not in response.json()["recommended_next_step"].lower()


async def test_failed_provider_falls_back_to_mock(client: AsyncClient) -> None:
    app.dependency_overrides[get_ai_provider] = BrokenProvider
    response = await client.post(f"{API}/ai/analyze-candidate", json={"application_id": SOPHIA})
    assert response.status_code == 201
    assert response.json()["model_name"] == "mock (fallback from broken)"


# Hosted providers, against a fake HTTP transport


ANALYSIS_JSON = {
    "summary": "Strong design systems background.",
    "skills_matched": [{"skill": "Figma", "evidence": "Listed on profile"}],
    "missing_skills": ["Interaction design"],
    "strengths": ["Design systems"],
    "concerns": [],
    "suggested_questions": ["Tell us about a component library you built."],
    "recommended_next_step": "Brief the panel before the design interview.",
}


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
        reply = {"candidates": [{"content": {"parts": [{"text": json.dumps(ANALYSIS_JSON)}]}}]}
        return httpx.Response(200, json=reply)

    provider = GeminiProvider(api_key="test-key", model="gemini-test", transport=httpx.MockTransport(handler))
    content = await provider.analyze_candidate(context)
    assert content.skills_matched[0].skill == "Figma"
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
