"""The Company page's profile, and the candidate assistant answering company questions from it alone."""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient

from app.core.config import settings
from app.services.ai.portal_context import PortalContext
from app.services.ai.portal_fallback import topic_of
from app.services.company_profile import company_profile
from tests.conftest import ALEX_AUTH, API, SOPHIA_AUTH, application_id, bearer

SOPHIA_APP = application_id("sophia-martinez")


async def test_candidates_read_the_company_profile(anonymous: AsyncClient) -> None:
    response = await anonymous.get(f"{API}/candidate/company", headers=bearer(SOPHIA_AUTH))
    assert response.status_code == 200
    body = response.json()
    profile = company_profile()
    assert body["name"] == settings.organization_name
    assert body["overview"] == settings.organization_overview  # one overview, configured once
    assert [item["title"] for item in body["products"]] == [item.title for item in profile.products]
    assert body["benefits"] == list(profile.benefits) and body["benefits_note"]
    assert body["locations"] == ["London", "San Francisco", "New York"]
    assert body["hiring_process"] and body["source"]
    assert all(link["url"].startswith("https://") for link in body["links"])

    # Candidates only: the recruiter workspace has its own routes, and nobody signed out sees it.
    assert (await anonymous.get(f"{API}/candidate/company", headers=bearer(ALEX_AUTH))).status_code == 403
    assert (await anonymous.get(f"{API}/candidate/company")).status_code == 401


async def test_the_assistant_answers_company_questions_from_the_profile(client: AsyncClient) -> None:
    profile = company_profile()

    async def ask(question: str) -> str:
        response = await client.post(f"{API}/candidate/ai/ask", json={"message": question})
        assert response.status_code == 200, response.text
        return response.json()["answer"]

    benefits = await ask("What benefits are offered?")
    assert profile.benefits[1] in benefits and profile.benefits_note in benefits
    offices = await ask("Where are the offices?")
    assert "London, San Francisco, New York" in offices
    assert "Your **Product Designer** role is listed as" in offices  # their own posting comes first
    culture = await ask("What's the culture like at Encord?")
    assert all(value.title in culture for value in profile.values)
    assert all(city in culture for city in profile.locations)
    about = await ask("What does the company do?")
    assert profile.overview in about and profile.products[0].title in about
    process = await ask("How does the interview process work?")
    assert "recruiter screen, then hiring manager conversation" in process  # Encord's usual stages
    assert "**Interview** (you're here)" in process  # and where this application is

    # The recruiter sees the topic, never the question.
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity", params={"limit": 200})).json()
    questions = [entry["title"] for entry in timeline if entry["activity_type"] == "question_asked"]
    assert "Asked about the company" in questions
    assert not any("benefits" in title.lower() or "offices" in title.lower() for title in questions)


# The Ask AI page's suggested prompts (frontend/lib/ask-ai.ts), and questions that must keep their topic.
ROUTES = {
    "What does the company do?": "company",
    "What benefits are offered?": "company",
    "What's the culture like?": "company",
    "How does the interview process work?": "process",
    "Where does my application stand?": "general",
    "What should I prepare?": "prepare",
    "Where are your offices?": "company",
    "Who are Encord's customers?": "company",
    "When is my Encord interview?": "logistics",
    "What does the Product Designer role involve?": "role",
    "Which customers would I work with in this role?": "role",
    "Is this role hybrid?": "role",
    "Is it remote?": "role",
    "How did my interview go?": "private",
}


def test_questions_reach_the_right_topic() -> None:
    assert {question: topic_of(question) for question in ROUTES} == ROUTES


async def test_the_assistant_prompt_carries_the_profile() -> None:
    facts = company_profile().facts()
    context = PortalContext(
        first_name="Sophia", location=None, headline=None, skills=(), company="Encord",
        company_overview=settings.organization_overview, company_profile=tuple(facts), job_title="Product Designer",
        job_department=None, job_location=None, employment_type="Full-time", hiring_manager=None, job_summary=None,
        job_requirements=(), stage_label="Interview", status="active", next_step="Prepare.", interviews=(),
        activity=(), messages=(), recruiter_name=None, now=datetime.now(UTC),
    )  # fmt: skip
    company_section = context.to_prompt().split("[company] approved facts you may share")[1].split("[application]")[0]
    assert all(f"- {fact}" in company_section for fact in facts)
    assert "Benefits for UK employees:" in company_section and "Typical interview process:" in company_section


async def test_new_portal_pages_are_reported(client: AsyncClient) -> None:
    visit = {"session_id": str(uuid.uuid4()), "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/engagement/sessions", json=visit)).status_code in (200, 201, 204)
    for page in ("applications", "company", "ai"):
        event = {"type": "page_view", "application_id": SOPHIA_APP, "page": page, "session_id": visit["session_id"]}
        response = await client.post(f"{API}/candidate/engagement/events", json={"events": [event]})
        assert response.status_code == 204, (page, response.text)
