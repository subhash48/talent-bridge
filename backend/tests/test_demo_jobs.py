"""Development-only demo jobs (services/demo_jobs.py) and the AI job writer: drafts, publishing to the demo
careers site beside the job's own ATS status, the counts recruiters see, and what the AI may write."""

import json
import uuid
from typing import Any, get_args

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import ApplicationStage, DemoApplicationStatus
from app.integrations.ashby.demo_ids import is_demo
from app.main import app
from app.models import Application, DemoApplication, DemoJobPosting, Job
from app.models.base import utcnow
from app.schemas.demo import MAX_ITEM, MAX_ITEMS, MAX_SUMMARY, JobPostingBrief, JobPostingContent, Seniority
from app.services.ai.client import AIProvider, AIProviderError, get_ai_provider
from app.services.ai.context import CandidateContext, parse_requirements
from app.services.ai.fallback import MockProvider
from app.services.ai.groq import GroqProvider
from app.services.ai.job_posting_policy import mentions_protected
from app.services.ai.llm import JOB_WRITER_SYSTEM_PROMPT
from app.services.demo_jobs import render_description
from tests.conftest import ALEX_EMAIL, API, SOPHIA_AUTH, bearer, candidate_id, job_id, user_by_email

MISSING = "00000000-0000-0000-0000-000000000000"

POSTING: dict[str, Any] = {
    "title": "ML Engineer",
    "department": "Engineering",
    "location": "San Francisco, CA",
    "work_arrangement": "Hybrid",
    "seniority": "Entry Level",
    "skills": ["Python", "PyTorch", "SQL"],
    "notes": "Work on machine learning systems for product teams.",
    "summary": "Build the machine learning systems behind the product.",
    "about_role": "You'll train, evaluate and ship models with the product teams.",
    "responsibilities": ["Train and evaluate models.", "Ship models to production."],
    "requirements": ["Working knowledge of Python.", "Familiarity with PyTorch."],
    "preferred_qualifications": ["Experience with SQL."],
    "about_team": "You'll join the Engineering team.",
}

BRIEF: dict[str, Any] = {
    "title": "ML Engineer",
    "department": "Engineering",
    "location": "San Francisco, CA",
    "work_arrangement": "Hybrid",
    "employment_type": "Full-time",
    "seniority": "Entry Level",
    "skills": ["Python", "PyTorch", "SQL", "APIs"],
    "notes": "Work on machine learning systems for product teams.",
}


@pytest.fixture(autouse=True)
def demo_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "enable_ashby_demo", True)


async def create(client: AsyncClient, **fields: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/demo/jobs", json={**POSTING, **fields})
    assert response.status_code == 201, response.text
    return response.json()


async def create_bare(client: AsyncClient) -> dict[str, Any]:
    response = await client.post(f"{API}/demo/jobs", json={"title": "Research Engineer"})
    assert response.status_code == 201, response.text
    return response.json()


def routes(demo_job_id: str = MISSING) -> list[tuple[str, str]]:
    return [
        ("GET", "/demo/jobs"),
        ("POST", "/demo/jobs"),
        ("POST", "/demo/jobs/generate"),
        ("GET", f"/demo/jobs/{demo_job_id}"),
        ("PATCH", f"/demo/jobs/{demo_job_id}"),
        ("POST", f"/demo/jobs/{demo_job_id}/publish"),
        ("POST", f"/demo/jobs/{demo_job_id}/unpublish"),
        ("POST", f"/demo/jobs/{demo_job_id}/close"),
    ]


# Who can reach the demo routes


async def test_demo_job_routes_answer_404_unless_the_demo_is_on(
    client: AsyncClient, anonymous: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_job = await create(client)
    monkeypatch.setattr(settings, "enable_ashby_demo", False)
    for method, path in routes(demo_job["id"]):
        for http in (client, anonymous):  # checked before sign-in: nobody learns the routes exist
            response = await http.request(method, f"{API}{path}", json=BRIEF)
            assert response.status_code == 404, (method, path)
            assert response.json()["error"]["message"] == "This endpoint doesn't exist."

    # Never in production, whatever the flag says.
    monkeypatch.setattr(settings, "enable_ashby_demo", True)
    monkeypatch.setattr(settings, "environment", "production")
    for method, path in routes(demo_job["id"]):
        assert (await client.request(method, f"{API}{path}", json=BRIEF)).status_code == 404, (method, path)


async def test_demo_jobs_are_for_recruiters(anonymous: AsyncClient) -> None:
    for method, path in routes():
        signed_out = await anonymous.request(method, f"{API}{path}", json=BRIEF)
        assert signed_out.status_code == 401, (method, path)
        candidate = await anonymous.request(method, f"{API}{path}", json=BRIEF, headers=bearer(SOPHIA_AUTH))
        assert candidate.status_code == 403, (method, path)


# Demo jobs


async def test_a_new_demo_job_is_a_draft_and_an_ordinary_job(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    demo_job = await create(client, generated_by_model="openai/gpt-oss-120b")
    assert demo_job["status"] == "draft"  # off the careers site
    assert demo_job["job_status"] == "draft"  # and a draft in the ATS
    assert demo_job["public_path"] == f"/demo/careers/{demo_job['id']}"
    assert demo_job["published_at"] is None and demo_job["closed_at"] is None
    assert demo_job["applicant_count"] == 0 and demo_job["pending_count"] == 0
    assert demo_job["employment_type"] == "Full-time"
    assert demo_job["generated_by_model"] == "openai/gpt-oss-120b"
    assert {key: demo_job[key] for key in POSTING} == POSTING

    # The job itself is an ordinary job with a simulator id, on the Jobs board like any other.
    job = (await client.get(f"{API}/jobs/{demo_job['id']}")).json()
    assert is_demo(job["external_id"])
    assert (job["title"], job["department"], job["location"]) == ("ML Engineer", "Engineering", "San Francisco, CA")
    assert job["description"] == (
        "Build the machine learning systems behind the product.\n\n"
        "About the role\nYou'll train, evaluate and ship models with the product teams.\n\n"
        "Responsibilities\n- Train and evaluate models.\n- Ship models to production.\n\n"
        "Requirements\n- Working knowledge of Python.\n- Familiarity with PyTorch.\n\n"
        "Preferred qualifications\n- Experience with SQL.\n\n"
        "About the team\nYou'll join the Engineering team.\n\n"
        "Skills: Python, PyTorch, SQL"
    )
    # The AI analysis reads the job's requirements from the Skills line.
    assert parse_requirements(job["description"]) == ("Python", "PyTorch", "SQL")
    assert demo_job["id"] in {listed["id"] for listed in (await client.get(f"{API}/jobs")).json()}

    async with sessions() as session:
        posting = await session.get(DemoJobPosting, uuid.UUID(demo_job["id"]))
        alex = await user_by_email(sessions, ALEX_EMAIL)
        assert posting is not None and alex is not None and posting.created_by == alex.id

    # A title is all a draft needs. With nothing else to show, there's no description.
    bare = await create_bare(client)
    assert bare["skills"] == [] and bare["summary"] is None
    assert (await client.get(f"{API}/jobs/{bare['id']}")).json()["description"] is None

    listed = (await client.get(f"{API}/demo/jobs")).json()
    assert [item["id"] for item in listed] == [bare["id"], demo_job["id"]]  # newest first
    assert (await client.get(f"{API}/demo/jobs/{demo_job['id']}")).json() == demo_job


async def test_editing_a_demo_job_rerenders_its_description(client: AsyncClient) -> None:
    demo_job = await create(client)
    response = await client.patch(
        f"{API}/demo/jobs/{demo_job['id']}",
        json={
            "title": "Machine Learning Engineer",
            "location": None,
            "about_role": None,
            "preferred_qualifications": [],
            "skills": ["Python", "python ", "Rust"],
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["title"] == "Machine Learning Engineer" and updated["location"] is None
    assert updated["skills"] == ["Python", "Rust"]  # repeats dropped
    assert updated["summary"] == POSTING["summary"]  # fields not sent are kept
    assert updated["updated_at"] > demo_job["updated_at"]

    job = (await client.get(f"{API}/jobs/{demo_job['id']}")).json()
    assert job["title"] == "Machine Learning Engineer" and job["location"] is None
    assert "About the role" not in job["description"] and "Preferred qualifications" not in job["description"]
    assert job["description"].startswith(POSTING["summary"])
    assert job["description"].endswith("\n\nSkills: Python, Rust")


async def test_publishing_needs_a_complete_posting(client: AsyncClient) -> None:
    bare = await create_bare(client)
    refused = await client.post(f"{API}/demo/jobs/{bare['id']}/publish")
    assert refused.status_code == 422
    error = refused.json()["error"]
    assert error["code"] == "posting_incomplete"
    assert error["message"] == (
        "Add a summary, a description of the role, at least one responsibility and at least one requirement "
        "before publishing."
    )
    assert [detail["field"] for detail in error["details"]] == [
        "summary",
        "about_role",
        "responsibilities",
        "requirements",
    ]
    assert all(detail["message"] for detail in error["details"])
    assert (await client.get(f"{API}/demo/jobs/{bare['id']}")).json()["status"] == "draft"

    complete = {key: POSTING[key] for key in ("summary", "about_role", "responsibilities")}
    await client.patch(f"{API}/demo/jobs/{bare['id']}", json=complete)
    missing_one = (await client.post(f"{API}/demo/jobs/{bare['id']}/publish")).json()["error"]
    assert missing_one["message"] == "Add at least one requirement before publishing."
    assert missing_one["details"] == [{"field": "requirements", "message": "Add at least one requirement."}]

    await client.patch(f"{API}/demo/jobs/{bare['id']}", json={"requirements": POSTING["requirements"]})
    published = await client.post(f"{API}/demo/jobs/{bare['id']}/publish")
    assert published.status_code == 200 and published.json()["status"] == "published"


async def test_publish_unpublish_and_close(client: AsyncClient) -> None:
    demo_job = await create(client)
    path = f"{API}/demo/jobs/{demo_job['id']}"

    published = (await client.post(f"{path}/publish")).json()
    assert (published["status"], published["job_status"]) == ("published", "open")
    assert published["published_at"] is not None and published["closed_at"] is None
    again = (await client.post(f"{path}/publish")).json()
    assert again["published_at"] == published["published_at"]  # idempotent

    # A published posting can be edited, but not into one the careers site couldn't show.
    broken = await client.patch(path, json={"summary": "", "requirements": []})
    assert broken.status_code == 422
    assert [detail["field"] for detail in broken.json()["error"]["details"]] == ["summary", "requirements"]
    kept = (await client.get(path)).json()
    assert kept["summary"] == POSTING["summary"] and kept["requirements"] == POSTING["requirements"]
    edited = await client.patch(path, json={"summary": "A new summary."})
    assert edited.status_code == 200 and edited.json()["status"] == "published"

    # Unpublishing takes it off the careers site; the job stays open for whoever already applied.
    unpublished = (await client.post(f"{path}/unpublish")).json()
    assert (unpublished["status"], unpublished["job_status"]) == ("draft", "open")
    assert (await client.post(f"{path}/unpublish")).json()["status"] == "draft"  # a draft stays a draft

    republished = (await client.post(f"{path}/publish")).json()
    assert republished["published_at"] > published["published_at"]  # the latest publish

    closed = (await client.post(f"{path}/close")).json()
    assert (closed["status"], closed["job_status"]) == ("closed", "closed")
    assert closed["closed_at"] is not None
    assert (await client.post(f"{path}/close")).json()["closed_at"] == closed["closed_at"]  # idempotent
    assert (await client.get(f"{API}/jobs/{demo_job['id']}")).json()["status"] == "closed"

    refused = await client.post(f"{path}/unpublish")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "posting_closed"

    reopened = (await client.post(f"{path}/publish")).json()
    assert (reopened["status"], reopened["job_status"]) == ("published", "open")
    assert reopened["closed_at"] is None and reopened["published_at"] > republished["published_at"]

    # Closing a draft closes the job too.
    draft = await create(client)
    closed_draft = (await client.post(f"{API}/demo/jobs/{draft['id']}/close")).json()
    assert (closed_draft["status"], closed_draft["job_status"]) == ("closed", "closed")


async def test_applicant_and_pending_counts(client: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> None:
    demo_job = await create(client)
    other = await create(client, title="Data Engineer")
    job = uuid.UUID(demo_job["id"])
    async with sessions() as session:
        session.add_all(
            [
                Application(candidate_id=uuid.UUID(candidate_id("sophia-martinez")), job_id=job),
                Application(  # archived ones count too: the job's whole pipeline
                    candidate_id=uuid.UUID(candidate_id("james-park")),
                    job_id=job,
                    stage=ApplicationStage.SCREENING,
                    archived_at=utcnow(),
                ),
                *(
                    DemoApplication(
                        job_id=job,
                        email=f"applicant{index}@mail.test",
                        first_name="Sam",
                        last_name="Lee",
                        phone="+1 415 555 0100",
                        status=status,
                        resume_file_name="resume.pdf",
                        resume_content_type="application/pdf",
                        resume_size_bytes=4,
                        resume_sha256="0" * 64,
                    )
                    for index, status in enumerate(DemoApplicationStatus)
                ),
            ]
        )
        await session.commit()

    counted = (await client.get(f"{API}/demo/jobs/{demo_job['id']}")).json()
    assert (counted["applicant_count"], counted["pending_count"]) == (2, 2)  # submitted ones are applications
    listed = {item["id"]: item for item in (await client.get(f"{API}/demo/jobs")).json()}
    assert (listed[demo_job["id"]]["applicant_count"], listed[demo_job["id"]]["pending_count"]) == (2, 2)
    assert (listed[other["id"]]["applicant_count"], listed[other["id"]]["pending_count"]) == (0, 0)


async def test_only_demo_jobs_are_demo_jobs(client: AsyncClient) -> None:
    for unknown in (MISSING, job_id("ML Engineer")):  # nonexistent, and an ordinary job without a posting
        for method, path in routes(unknown)[3:]:
            response = await client.request(method, f"{API}{path}", json={"summary": "x"})
            assert response.status_code == 404, (method, path)
            assert response.json()["error"]["code"] == "demo_job_not_found"


async def test_demo_job_validation(client: AsyncClient) -> None:
    demo_job = await create(client)
    path = f"{API}/demo/jobs/{demo_job['id']}"
    for body in (
        {"title": ""},
        {"title": "X", "work_arrangement": "Office"},
        {"title": "X", "seniority": "Junior"},
        {"title": "X", "employment_type": "Freelance"},
        {"title": "X", "responsibilities": [f"Item {index}" for index in range(MAX_ITEMS + 1)]},
        {"title": "X", "requirements": ["x" * (MAX_ITEM + 1)]},
        {"title": "X", "summary": "x" * (MAX_SUMMARY + 1)},
    ):
        assert (await client.post(f"{API}/demo/jobs", json=body)).status_code == 422, body
    for body in ({"title": None}, {"skills": None}, {"employment_type": None}, {"requirements": None}):
        assert (await client.patch(path, json=body)).status_code == 422, body
    assert (await client.get(f"{API}/demo/jobs/not-a-uuid")).status_code == 422


# The AI job writer


async def test_generate_a_draft_with_the_mock_provider(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    async def jobs() -> int:
        async with sessions() as session:
            return await session.scalar(select(func.count()).select_from(Job)) or 0

    before = await jobs()
    response = await client.post(f"{API}/demo/jobs/generate", json=BRIEF)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["model_name"], body["removed"]) == ("mock", 0)
    draft = body["draft"]
    assert draft["summary"].startswith(f"{settings.organization_name} is hiring an entry-level ML Engineer")
    assert "Engineering team in San Francisco, CA" in draft["summary"] and "hybrid, full-time" in draft["summary"]
    assert draft["about_role"].startswith(BRIEF["notes"])
    assert 4 <= len(draft["responsibilities"]) <= 6 and 4 <= len(draft["requirements"]) <= 6
    assert 2 <= len(draft["preferred_qualifications"]) <= 4
    assert any("Python and PyTorch" in requirement for requirement in draft["requirements"])
    assert draft["skills"][:4] == BRIEF["skills"]
    assert settings.organization_overview in draft["about_team"]
    assert await jobs() == before  # a draft only: nothing is saved

    # Good enough to publish as it stands.
    saved = await create(client, **draft, generated_by_model=body["model_name"])
    assert (await client.post(f"{API}/demo/jobs/{saved['id']}/publish")).status_code == 200

    assert (await client.post(f"{API}/demo/jobs/generate", json={"title": ""})).status_code == 422
    assert (
        await client.post(f"{API}/demo/jobs/generate", json={"title": "X", "seniority": "Junior"})
    ).status_code == 422


@pytest.mark.parametrize(
    "title",
    ["ML Engineer", "Software Engineer", "Product Designer", "Product Manager", "Account Executive", "UX Researcher"],
)
async def test_mock_drafts_are_complete_and_pass_the_policy(title: str) -> None:
    for seniority in (None, *get_args(Seniority)):
        for skills in ([], ["Python"], ["Figma", "Design systems", "Prototyping", "User research", "Accessibility"]):
            brief = JobPostingBrief(title=title, seniority=seniority, skills=skills)
            draft = await MockProvider().write_job_posting(brief, "Encord", settings.organization_overview)
            lines = [draft.summary, draft.about_role, draft.about_team or ""]
            lines += draft.responsibilities + draft.requirements + draft.preferred_qualifications + draft.skills
            assert not [line for line in lines if mentions_protected(line)], (title, seniority)
            assert draft.summary and draft.about_role and draft.about_team, (title, seniority)
            assert 4 <= len(draft.responsibilities) <= 6 and 4 <= len(draft.requirements) <= 6, (title, seniority)
            assert 2 <= len(draft.preferred_qualifications) <= 4 and 3 <= len(draft.skills) <= 8, (title, seniority)
            assert draft.skills[: len(skills)] == skills


async def test_mock_drafts_name_the_level_once_and_take_the_right_article() -> None:
    async def summary(**brief: Any) -> str:
        draft = await MockProvider().write_job_posting(JobPostingBrief(**brief), "Encord", "")
        assert draft.about_team is None  # nothing to say about the team without an overview or a department
        return draft.summary

    assert (await summary(title="Senior ML Engineer", seniority="Senior")).startswith(
        "Encord is hiring a Senior ML Engineer."
    )
    assert (await summary(title="UX Designer")).startswith("Encord is hiring a UX Designer.")
    assert (await summary(title="Data Engineer", employment_type="Internship", seniority="Internship")).startswith(
        "Encord is hiring a Data Engineer intern. In this internship, you'll"
    )
    assert (await summary(title="Account Executive", location="Remote", work_arrangement="Remote")).startswith(
        "Encord is hiring an Account Executive. In this remote, full-time role, you'll"
    )


class BrokenProvider(AIProvider):
    """A hosted provider that is down."""

    name = model = "broken"

    async def analyze_candidate(self, context: CandidateContext) -> Any:
        raise AIProviderError("timed out")

    async def ask_candidate(self, context: CandidateContext, question: str) -> Any:
        raise AIProviderError("timed out")

    async def draft_message(self, context: CandidateContext, purpose: Any, instructions: str | None = None) -> Any:
        raise AIProviderError("timed out")


class OversharingProvider(MockProvider):
    name = model = "oversharing"

    async def write_job_posting(self, brief: JobPostingBrief, organization: str, overview: str) -> JobPostingContent:
        draft = await super().write_job_posting(brief, organization, overview)
        return draft.model_copy(
            update={
                "summary": f"{draft.summary} Perfect for a recent graduate.",
                "requirements": [*draft.requirements, "Native English speaker.", "Must be a culture fit."],
                "about_team": "He will join a young team. The team builds data tooling.",
            }
        )


async def test_generate_falls_back_to_the_mock_and_applies_the_policy(client: AsyncClient) -> None:
    app.dependency_overrides[get_ai_provider] = BrokenProvider
    fallback = (await client.post(f"{API}/demo/jobs/generate", json=BRIEF)).json()
    assert fallback["model_name"] == "mock (fallback from broken)"
    assert fallback["draft"]["requirements"]

    app.dependency_overrides[get_ai_provider] = OversharingProvider
    body = (await client.post(f"{API}/demo/jobs/generate", json=BRIEF)).json()
    assert (body["model_name"], body["removed"]) == ("oversharing", 4)
    draft = body["draft"]
    assert "graduate" not in draft["summary"] and draft["summary"].startswith("Encord is hiring")
    assert not any("speaker" in item or "culture fit" in item for item in draft["requirements"])
    assert draft["about_team"] == "The team builds data tooling."


# Hosted models, against a fake HTTP transport


def groq_answer(content: dict[str, Any] | str, seen: dict[str, Any] | None = None) -> GroqProvider:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen["body"] = json.loads(request.content)
        text = content if isinstance(content, str) else json.dumps(content)
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    return GroqProvider(api_key="test-key", model="gpt-test", transport=httpx.MockTransport(handler))


async def test_hosted_drafts_are_read_leniently() -> None:
    long_summary = " ".join(["machine learning"] * 60)
    answer = {
        "summary": long_summary,
        "about_role": "You'll  ship\nmodels\u2011first.",
        "responsibilities": [f"- Responsibility {index}" for index in range(15)] + ["- Responsibility 1"],
        "requirements": ["1. Working knowledge of Python", "", "working knowledge of python", "x" * 400],
        "preferred_qualifications": "Experience with SQL\n• Experience with Rust",
        "skills": ["PyTorch", "Machine learning", "Comfortable working across the whole machine learning stack"],
        "about_team": None,
        "unexpected": "ignored",
    }
    seen: dict[str, Any] = {}
    provider = groq_answer(f"```json\n{json.dumps(answer)}\n```", seen)
    brief = JobPostingBrief(title="ML Engineer", skills=["Python", "pytorch"], seniority="Entry Level")
    draft = await provider.write_job_posting(brief, "Encord", "Encord builds data tooling.")

    assert len(draft.summary) <= MAX_SUMMARY and draft.summary.endswith("…")
    assert draft.summary[:-1].split()[-1] in ("machine", "learning")  # cut at a word boundary
    assert draft.about_role == "You'll ship models-first."
    assert draft.responsibilities == [f"Responsibility {index}" for index in range(MAX_ITEMS)]
    assert draft.requirements[0] == "Working knowledge of Python" and len(draft.requirements) == 2
    assert len(draft.requirements[1]) <= MAX_ITEM and draft.requirements[1].endswith("…")
    assert draft.preferred_qualifications == ["Experience with SQL", "Experience with Rust"]
    assert draft.skills == ["Python", "pytorch", "Machine learning"]  # the recruiter's first; sentences dropped
    assert draft.about_team is None

    messages = seen["body"]["messages"]
    assert messages[0]["content"] == JOB_WRITER_SYSTEM_PROMPT.format(organization="Encord")
    prompt = messages[1]["content"]
    assert "Job title: ML Engineer" in prompt and "Seniority: Entry Level" in prompt
    assert "Skills: Python, pytorch" in prompt and "Department: not given" in prompt
    assert "Encord builds data tooling." in prompt
    assert seen["body"]["response_format"] == {"type": "json_object"}


async def test_unusable_hosted_drafts_fall_back_to_the_mock(client: AsyncClient) -> None:
    brief = JobPostingBrief(title="ML Engineer")
    for answer in ({"summary": "Only a summary."}, "Sure! Here's a posting:", {"responsibilities": {"a": 1}}):
        with pytest.raises(AIProviderError):
            await groq_answer(answer).write_job_posting(brief, "Encord", "")

    app.dependency_overrides[get_ai_provider] = lambda: groq_answer({"posting": {"summary": "Nested."}})
    body = (await client.post(f"{API}/demo/jobs/generate", json=BRIEF)).json()
    assert body["model_name"] == "mock (fallback from groq)" and body["draft"]["summary"]

    # A usable answer is the model's, with the policy applied.
    answer = {
        "summary": "Join us to build machine learning systems.",
        "about_role": "You'll train and ship models. He will mentor you.",
        "responsibilities": ["Train models.", "Ship models."],
        "requirements": ["Python.", "PyTorch.", "Able\u2011bodied."],
        "preferred_qualifications": [],
        "skills": ["Python"],
        "about_team": "",
    }
    app.dependency_overrides[get_ai_provider] = lambda: groq_answer(answer)
    body = (await client.post(f"{API}/demo/jobs/generate", json=BRIEF)).json()
    assert (body["model_name"], body["removed"]) == ("gpt-test", 2)
    assert body["draft"]["about_role"] == "You'll train and ship models."
    assert body["draft"]["requirements"] == ["Python.", "PyTorch."]


def test_render_description_without_optional_sections() -> None:
    posting = DemoJobPosting(summary="One line.", responsibilities=["Do it."], requirements=[], skills=[])
    assert render_description(posting) == "One line.\n\nResponsibilities\n- Do it."
