"""A shortlist the recruiter makes: candidates against job-related criteria, each with its evidence.

No scores and nothing personal: only the criteria chosen (or the job's own requirements), found in the
candidate's listed skills, headline or résumé. Nobody is moved, rejected or contacted.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Candidate, CandidateActivity, CandidateResume, Message
from app.services.candidate_matching import experience
from app.services.personal_characteristics import REFUSAL
from tests.conftest import API, application_id, candidate_id, job_id

DESIGNER = job_id("Product Designer")  # Encord's
ML = job_id("ML Engineer")


async def find(client: AsyncClient, **body: object) -> dict:
    response = await client.post(f"{API}/candidates/match", json=body)
    assert response.status_code == 200, response.text
    return response.json()


async def test_five_matching_figma_and_design_systems(client: AsyncClient) -> None:
    result = await find(client, job_ids=[DESIGNER], skills=["Figma", "Design systems"], limit=5)
    assert result["criteria"] == ["Figma", "Design systems"] and result["criteria_source"] == "recruiter"
    assert [item["label"] for item in result["filters"]] == ["Job: Product Designer · Encord"]
    # Ten applicants; Leo lists neither skill, so nine match at least one.
    assert (result["considered"], result["matching"], len(result["items"])) == (10, 9, 5)
    shown = [(item["name"], item["matched"]) for item in result["items"]]
    # Both criteria first (earliest application first), then one of them.
    assert [matched for _, matched in shown] == [2, 2, 2, 2, 1]
    assert {name for name, matched in shown if matched == 2} == {
        "Sophia Martinez",
        "Mia Novak",
        "Maya Brooks",
        "Ana Ruiz",
    }
    applied = [item["applied_at"] for item in result["items"][:4]]
    assert applied == sorted(applied)

    sophia = next(item for item in result["items"] if item["name"] == "Sophia Martinez")
    assert sophia["evidence"] == [
        {"criterion": "Figma", "matched": True, "source": "skills"},
        {"criterion": "Design systems", "matched": True, "source": "skills"},
    ]
    assert sophia["experience"] == {
        "label": "4 years product design experience",
        "source": "headline",
        "quote": "Product designer with 4 years of experience building design systems for data-heavy B2B tools",
    }
    assert sophia["application_id"] == application_id("sophia-martinez") and sophia["company_name"] == "Encord"
    partial = result["items"][4]
    assert [(e["criterion"], e["matched"]) for e in partial["evidence"]] == [("Figma", True), ("Design systems", False)]


async def test_without_criteria_the_jobs_own_requirements_are_used(client: AsyncClient) -> None:
    result = await find(client, job_ids=[ML], limit=10)
    assert result["criteria_source"] == "job_requirements"
    assert result["criteria"] == ["PyTorch", "Computer vision", "Distributed training", "MLOps", "Active learning"]
    assert result["items"][0]["name"] == "James Park" and result["items"][0]["matched"] == 4


async def test_evidence_can_come_from_the_headline_or_the_resume(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    async with sessions() as session:
        session.add(
            CandidateResume(
                candidate_id=uuid.UUID(candidate_id("leo-martins")),
                file_name="leo.pdf",
                content_type="application/pdf",
                size_bytes=10,
                sha256="0" * 64,
                content=b"%PDF-1.4",
                text="Visual designer.\nShipped a design system in Figma for a retail app.",
            )
        )
        await session.commit()
    result = await find(client, job_ids=[DESIGNER], skills=["Design system", "B2B SaaS"], limit=20)
    by_name = {item["name"]: item for item in result["items"]}
    assert by_name["Leo Martins"]["evidence"][0] == {"criterion": "Design system", "matched": True, "source": "resume"}
    # "B2B SaaS" is one of James Whitfield's listed skills, and in Sophia's headline only as "B2B tools".
    assert by_name["James Whitfield"]["evidence"][1]["source"] == "skills"
    assert by_name["Sophia Martinez"]["evidence"][1]["matched"] is False


async def test_filters_narrow_it_and_are_all_listed(client: AsyncClient) -> None:
    result = await find(client, job_ids=[DESIGNER], skills=["Figma"], stage="screening", location="London")
    assert [item["name"] for item in result["items"]] == ["James Whitfield"]
    assert [item["label"] for item in result["filters"]] == [
        "Job: Product Designer · Encord",
        "Stage: Screening",
        "Location: London",
    ]
    picked = [application_id("maya-brooks"), application_id("leo-martins")]
    shown = await find(client, skills=["Figma"], application_ids=picked)
    assert [item["name"] for item in shown["items"]] == ["Maya Brooks"]
    assert shown["filters"][-1]["label"] == "The 2 candidates in view"
    interviewed = await find(client, interview="awaiting_update", limit=50)
    assert interviewed["filters"] == [{"key": "interview", "label": "Interviewed, no update since"}]
    assert any(item["name"].startswith("Diego") for item in interviewed["items"])  # interviewed, nothing since


async def test_nothing_personal_is_read_and_nothing_changes(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    async with sessions() as session:
        before = [
            await session.scalar(select(func.count()).select_from(table)) for table in (CandidateActivity, Message)
        ]
    first = await find(client, job_ids=[DESIGNER], skills=["Figma", "Design systems"], limit=20)
    async with sessions() as session:
        # Different pronouns and a different location change nothing about who matches, or in what order.
        await session.execute(update(Candidate).values(pronouns="they/them", location="Somewhere, Elsewhere"))
        await session.commit()
        after = [
            await session.scalar(select(func.count()).select_from(table)) for table in (CandidateActivity, Message)
        ]
    second = await find(client, job_ids=[DESIGNER], skills=["Figma", "Design systems"], limit=20)
    assert [i["application_id"] for i in first["items"]] == [i["application_id"] for i in second["items"]]
    assert before == after  # a search records nothing and sends nothing

    def keys(value: object) -> set[str]:
        if isinstance(value, dict):
            return set(value) | {key for item in value.values() for key in keys(item)}
        if isinstance(value, list):
            return {key for item in value for key in keys(item)}
        return set()

    assert keys(first).isdisjoint({"pronouns", "email", "phone", "engagement", "score", "rank", "demographics"})


async def test_only_job_related_criteria_can_be_asked(client: AsyncClient) -> None:
    for body in ({"skills": ["Figma"], "gender": "female"}, {"skills": ["Figma"], "pronouns": "she/her"}):
        assert (await client.post(f"{API}/candidates/match", json=body)).status_code == 422
    assert (await client.post(f"{API}/candidates/match", json={"limit": 0})).status_code == 422
    # A personal characteristic as a criterion is refused, never matched against résumés.
    for criteria in (["Hispanic", "pregnant"], ["Figma", "women"], ["age 25"], ["under 30"], ["Christian"]):
        refused = await client.post(f"{API}/candidates/match", json={"skills": criteria})
        assert refused.status_code == 400, criteria
        assert refused.json()["error"] == {"code": "personal_characteristic", "message": REFUSAL, "details": None}
    # Job-related ones that look alike still work.
    for criteria in (["Spanish", "Mandarin"], ["over 10 years of experience"], ["React Native"], ["Accessibility"]):
        assert (await client.post(f"{API}/candidates/match", json={"skills": criteria})).status_code == 200


def test_the_experience_note_is_years_of_that_work_never_an_age_or_time_away() -> None:
    def note(title: str, text: str) -> str | None:
        found = experience(title, text, None)
        return found.label if found else None

    assert note("Product Designer", "Product designer with 4 years of experience in B2B SaaS") == (
        "4 years product design experience"
    )
    assert note("ML Engineer", "ML engineer, 5+ years building recommendation systems") == (
        "5 years ML engineering experience"
    )
    assert note("Product Designer", "Took 3 years of parental leave after 6 years of product design work") == (
        "6 years product design experience"
    )
    for title, text in (
        ("Senior Product Designer", "I am a 52 year old product designer based in Austin."),
        ("Product Designer", "Product designer, 29 years old"),
        ("ML Engineer", "Returning ML engineer after 3 years of parental leave"),
        ("Product Designer", "Product manager with 6 years of experience"),  # not design
        ("ML Engineer", "I spent 10 years as a civil engineer building bridges."),  # not ML
        ("Data Scientist", "Data entry clerk for 12 years."),
        ("Product Designer", "I am 34 years old and have worked as a product designer since 2019."),
    ):
        assert note(title, text) is None, text
