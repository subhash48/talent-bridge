"""Interview preparation: grounded in the candidate's own résumé, shaped by their stage, and a private
text mock interview that never scores anyone."""

import json
from datetime import UTC, datetime
from typing import Any

import httpx
from httpx import AsyncClient

from app.integrations.supabase_admin import get_supabase_admin
from app.main import app
from app.services.ai.client import get_ai_provider
from app.services.ai.groq import GroqProvider
from app.services.ai.portal_context import PortalContext
from app.services.ai.portal_fallback import PRACTICE, prepare, resume_talking_points
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import API, bearer, job_id
from tests.test_careers import EMAIL, application

PRODUCT_DESIGNER = job_id("Product Designer")


async def careers_applicant(anonymous: AsyncClient) -> dict[str, str]:
    """Ana applies on the careers site with her résumé, and signs in."""
    admin = FakeSupabaseAdmin()
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    applied = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    assert applied.status_code == 200
    return bearer(admin.users[EMAIL], email=EMAIL)


def test_talking_points_come_from_the_resumes_substance() -> None:
    resume = "Ana Lima\nana@inbox.dev · +55 11 99999 0000\nDesign systems at Nubank, 3 years\nLed the checkout redesign\nFigma"
    points = resume_talking_points(resume)
    assert points == [
        "Be ready to talk through: Design systems at Nubank, 3 years. What you did, and how it turned out.",
        "Be ready to talk through: Led the checkout redesign. What you did, and how it turned out.",
    ]
    assert resume_talking_points(None) == [] and resume_talking_points("") == []


async def test_prep_draws_on_the_candidates_own_resume(anonymous: AsyncClient) -> None:
    token = await careers_applicant(anonymous)
    prep = (await anonymous.get(f"{API}/candidate/prep", headers=token)).json()
    assert prep["role"] == "Product Designer"
    assert any("Design systems at Nubank" in point for point in prep["resume_talking_points"])
    assert prep["practice_questions"]


def context_at(stage: str) -> PortalContext:
    return PortalContext(
        first_name="Ana", location=None, headline=None, skills=(), company="Encord", company_overview="Encord.",
        company_profile=(), job_title="Product Designer", job_department=None, job_location=None,
        employment_type="Full-time", hiring_manager=None, job_summary=None, job_requirements=("Figma",),
        stage_label=stage, status="active", next_step="", interviews=(), activity=(), messages=(),
        recruiter_name=None, now=datetime.now(UTC),
    )  # fmt: skip


def test_prep_without_an_interview_follows_the_stage() -> None:
    screening, offer, applied = (prepare(context_at(stage)) for stage in ("Screening", "Offer", "Applied"))
    assert screening.practice_questions[0] in PRACTICE["screen"]
    assert offer.what_to_expect != applied.what_to_expect  # the offer stage, not interview prep
    assert applied.practice_questions[0] in PRACTICE["general"]


async def test_sophias_prep_is_for_her_booked_interview(client: AsyncClient) -> None:
    prep = (await client.get(f"{API}/candidate/prep")).json()
    assert prep["interview"]["title"] == "Design interview"
    assert prep["resume_talking_points"] == []  # no résumé on file for her


async def test_the_resume_reaches_only_the_candidates_own_prompts(anonymous: AsyncClient) -> None:
    token = await careers_applicant(anonymous)
    prompts: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        prompts.append(json.loads(request.content)["messages"][-1]["content"])
        reply = {"answer": "- **Good start.** Add the outcome."}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]})

    app.dependency_overrides[get_ai_provider] = lambda: GroqProvider(
        api_key="k", model="llama", transport=httpx.MockTransport(handler)
    )
    feedback = await anonymous.post(
        f"{API}/candidate/prep/mock",
        json={"question": "Tell us about a design system you built.", "answer": "I built one at Nubank."},
        headers=token,
    )
    assert feedback.status_code == 200 and feedback.json()["feedback"].startswith("- **Good start.**")
    [prompt] = prompts
    assert "[your résumé]" in prompt and "Design systems at Nubank" in prompt
    assert "Never give a score" in prompt


async def test_mock_interview_feedback_coaches_and_never_scores(client: AsyncClient) -> None:
    async def practise(answer: str) -> str:
        body: dict[str, Any] = {"question": "Tell us about a project you're proud of.", "answer": answer}
        response = await client.post(f"{API}/candidate/prep/mock", json=body)
        assert response.status_code == 200
        return response.json()["feedback"]

    short = await practise("We did a redesign.")
    assert "**Say more.**" in short and "**Make your part clear.**" in short and "**End with the outcome.**" in short
    strong = await practise(
        "At my last company I led the redesign of our design system in Figma. I audited 40 components, "
        "worked with engineers on tokens, and ran user research with five teams. I shipped it in three months "
        "and it reduced design review time by 30 percent, which let us launch the new checkout two weeks early."
    )
    assert "**Good length.**" in strong and "**End with the outcome.**" not in strong
    assert "score" not in (short + strong).lower() and "/10" not in short + strong

    nothing = await client.post(f"{API}/candidate/prep/mock", json={"question": "Why us?", "answer": ""})
    assert nothing.status_code == 422


async def test_recruiters_cant_use_the_practice_interview(anonymous: AsyncClient) -> None:
    from tests.conftest import ALEX_AUTH

    refused = await anonymous.post(
        f"{API}/candidate/prep/mock", json={"question": "Why us?", "answer": "Because."}, headers=bearer(ALEX_AUTH)
    )
    assert refused.status_code == 403
