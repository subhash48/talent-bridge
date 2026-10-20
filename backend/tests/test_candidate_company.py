"""The Company page's profile, and the candidate assistant answering company questions from it alone.

The profile is the employer's behind the application: application -> job -> company. Sophia's default
application is the Product Designer role at Encord (tests/test_candidate_context.py covers her Nova AI one).
"""

from httpx import AsyncClient

from app.services.ai.portal_fallback import topic_of
from tests.companies import portal_context, seeded_profile
from tests.conftest import ALEX_AUTH, API, SOPHIA_AUTH, application_id, bearer

SOPHIA_APP = application_id("sophia-martinez")


async def test_candidates_read_their_employers_profile(anonymous: AsyncClient) -> None:
    response = await anonymous.get(f"{API}/candidate/company", headers=bearer(SOPHIA_AUTH))
    assert response.status_code == 200
    body = response.json()
    profile = seeded_profile("encord")
    assert body["name"] == "Encord" and body["application_id"] == SOPHIA_APP
    assert body["overview"] == profile.overview and body["logo_url"] == "/logos/encord.svg"
    assert [item["title"] for item in body["products"]] == [item.title for item in profile.products]
    assert body["benefits"] == list(profile.benefits) and body["benefits_note"]
    assert body["locations"] == ["London", "San Francisco", "New York"]
    assert body["hiring_process"] and body["source"]
    assert all(link["url"].startswith("https://") for link in body["links"])

    # Candidates only: the recruiter workspace has its own routes, and nobody signed out sees it.
    assert (await anonymous.get(f"{API}/candidate/company", headers=bearer(ALEX_AUTH))).status_code == 403
    assert (await anonymous.get(f"{API}/candidate/company")).status_code == 401


async def test_the_assistant_answers_company_questions_from_the_profile(client: AsyncClient) -> None:
    profile = seeded_profile("encord")

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

    # What a candidate asks the assistant stays private: nothing new on the recruiter's timeline.
    timeline = (await client.get(f"{API}/applications/{SOPHIA_APP}/activity", params={"limit": 200})).json()
    questions = [entry["title"] for entry in timeline if entry["activity_type"] == "question_asked"]
    assert questions == ["Asked about the product team"]  # seeded, from before


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
    # The candidate names the employer of the application they're asking about.
    assert {question: topic_of(question, "Encord") for question in ROUTES} == ROUTES
    assert topic_of("Who are Nova AI's customers?", "Nova AI") == "company"


async def test_the_assistant_prompt_carries_the_profile() -> None:
    profile = seeded_profile("encord")
    facts = profile.facts()
    context = portal_context(profile)
    company_section = context.to_prompt().split("[company] approved facts you may share")[1].split("[application]")[0]
    assert all(f"- {fact}" in company_section for fact in facts)
    assert "Benefits for UK employees:" in company_section and "Typical interview process:" in company_section


def test_a_profile_with_little_shared_says_only_that() -> None:
    """An employer that has only given its name and overview: no empty statements in the prompt."""
    profile = seeded_profile("encord")
    sparse = type(profile)(
        id=profile.id, name="Acme", logo_url=None, website=None, overview="Acme makes anvils.", mission="",
        highlights=(), products=(), values=(), benefits=(), benefits_scope="", benefits_note="", locations=(),
        locations_note="", hiring_process=(), hiring_note="", links=(), source="",
    )  # fmt: skip
    assert sparse.facts() == []
    section = portal_context(sparse).to_prompt().split("[company]")[1].split("[application]")[0]
    assert "Acme makes anvils." in section and "Benefits" not in section and "Offices" not in section
