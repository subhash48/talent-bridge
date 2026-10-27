"""A shortlist the recruiter makes: candidates against job-related criteria, each with its evidence.

No scores and nothing personal: only the criteria chosen (or the job's own requirements), found in the
candidate's listed skills, headline or résumé. Nobody is moved, rejected or contacted.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Candidate, CandidateActivity, CandidateResume, Message
from app.services.candidate_matching import _evidence, _mentions, experience
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
        {
            "criterion": "Figma",
            "matched": True,
            "source": "skills",
            "kind": "criterion",
            "label": "Figma",
            "quote": None,
        },
        {
            "criterion": "Design systems",
            "matched": True,
            "source": "skills",
            "kind": "criterion",
            "label": "Design systems",
            "quote": None,
        },
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
    # Found in his résumé, with the words it was found in.
    assert by_name["Leo Martins"]["evidence"][0] == {
        "criterion": "Design system",
        "matched": True,
        "source": "resume",
        "kind": "criterion",
        "label": "Design system",
        "quote": "Shipped a design system in Figma for a retail app.",
    }
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


async def test_the_jobs_requirements_are_criteria_a_request_can_send_back(client: AsyncClient) -> None:
    listed = [f"Skill {number}" for number in range(25)]
    long = "Comfortable presenting design rationale to senior stakeholders across several time zones"
    description = f"Requirements: Figma, {long}, native English speaker, {', '.join(listed)}"
    job = (await client.post(f"{API}/jobs", json={"title": "Platform Designer", "description": description})).json()
    found = await find(client, job_ids=[job["id"]])
    assert found["criteria_source"] == "job_requirements"
    assert found["criteria"][:2] == ["Figma", "Skill 0"] and len(found["criteria"]) == 20
    assert long not in found["criteria"] and "native English speaker" not in found["criteria"]
    # The Shortlist panel offers them to edit: sent back as they are, they're accepted.
    assert (await find(client, job_ids=[job["id"]], skills=found["criteria"]))["criteria"] == found["criteria"]


async def test_a_narrowed_view_of_thousands_can_be_shortlisted(client: AsyncClient) -> None:
    in_view = [application_id("maya-brooks"), *(str(uuid.uuid4()) for _ in range(2500))]
    found = await find(client, application_ids=in_view, skills=["Figma"])
    assert [item["name"] for item in found["items"]] == ["Maya Brooks"]


def test_short_names_and_double_s_words_match_only_themselves() -> None:
    assert _mentions("Backend services in Go and Rust", "Go")
    assert _mentions("Statistics in R and Python", "R")
    assert _mentions("Firmware in C, some C++", "C")
    assert _mentions("UX research lead", "ux")
    for text, term in (
        ("Owned go-to-market launches", "Go"),
        ("Ready to go live", "Go"),
        ("Led R&D for a hardware team", "R"),
        ("Presented to the C-suite", "C"),
        ("Embedded C++ only", "C"),
        ("Statistical analysis in SAS and R", "Sass"),
    ):
        assert not _mentions(text, term), (text, term)
    assert _mentions("Styled with Sass and CSS modules", "Sass")
    assert _mentions("Built design systems", "design system") and _mentions("A design system", "Design systems")


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


# Availability and what applicants wrote: a small business's shortlist.

KITCHEN_APPLICANTS = (
    ("Maria", "Lopez", "Two years as a prep cook in a busy kitchen.", ["friday", "saturday"]),
    ("John", "Patel", "Three years serving tables at a family restaurant.", ["friday", "saturday"]),
    ("Aisha", "Khan", "I worked the line in a hotel kitchen for a year.", ["saturday"]),
    ("Tom", "Becker", "Retail work at a bookshop.", ["friday", "saturday", "sunday"]),
    ("Lena", "Park", None, ["sunday"]),
)


async def kitchen_job(client: AsyncClient, anonymous: AsyncClient) -> str:
    from tests.test_careers import application

    job = (
        await client.post(
            f"{API}/jobs",
            json={"title": "Kitchen Assistant", "work_days": ["friday", "saturday", "sunday"], "pay": "$18/hour"},
        )
    ).json()
    for first, last, note, days in KITCHEN_APPLICANTS:
        body = application(
            first_name=first,
            last_name=last,
            email=f"{first.lower()}.{last.lower()}@inbox.dev",
            availability=days,
            experience_note=note,
            phone="+1 503 555 0100",
        )
        assert (await anonymous.post(f"{API}/careers/jobs/{job['id']}/apply", json=body)).status_code == 200
    return job["id"]


async def test_three_with_kitchen_experience_available_friday_and_saturday(
    client: AsyncClient, anonymous: AsyncClient
) -> None:
    job = await kitchen_job(client, anonymous)
    result = await find(
        client, job_ids=[job], skills=["Kitchen experience"], available_days=["saturday", "friday"], limit=3
    )
    assert (result["criteria"], result["available_days"]) == (["Kitchen experience"], ["friday", "saturday"])
    shown = {item["name"]: [(e["label"], e["matched"]) for e in item["evidence"]] for item in result["items"]}
    assert list(shown) == ["Maria Lopez", "John Patel", "Aisha Khan"]  # all three shown first, then earliest
    assert shown["Maria Lopez"] == [
        ("Kitchen experience", True),
        ("Friday available", True),
        ("Saturday available", True),
    ]
    # Restaurant work, said as restaurant work: never claimed as kitchen experience.
    assert shown["John Patel"] == [
        ("Restaurant experience", True),
        ("Friday available", True),
        ("Saturday available", True),
    ]
    assert shown["Aisha Khan"] == [
        ("Kitchen experience", True),
        ("No Friday availability given", False),
        ("Saturday available", True),
    ]
    maria = result["items"][0]["evidence"][0]
    assert (maria["source"], maria["quote"]) == ("application", "Two years as a prep cook in a busy kitchen.")
    assert result["items"][0]["evidence"][1]["kind"] == "availability"
    assert result["matching"] == 4  # Lena shows none of them, so she isn't in this list (and is still an applicant)


async def test_availability_alone_is_a_criterion(client: AsyncClient, anonymous: AsyncClient) -> None:
    job = await kitchen_job(client, anonymous)
    result = await find(client, job_ids=[job], available_days=["sunday"], limit=10)
    assert sorted(item["name"] for item in result["items"]) == ["Lena Park", "Tom Becker"]
    assert result["criteria"] == []


def _evidence_for(criterion: str, note: str) -> dict[str, object]:
    person = Candidate(first_name="Test", last_name="Applicant", email="t@inbox.dev", skills=[])
    return _evidence(criterion, person, note, None).model_dump()


@pytest.mark.parametrize(
    ("criterion", "note"),
    [
        ("Kitchen experience", "I have no kitchen experience."),
        ("Kitchen experience", "I don't have any kitchen experience yet."),
        ("Restaurant experience", "Never worked in a restaurant, but keen to learn."),
        ("Customer service experience", "I set up Linux servers at my last job."),
        ("Cook experience", "I love to cook for my family."),
        ("Barista experience", "I go to the cafe every morning."),
    ],
)
def test_words_that_dont_show_the_experience_arent_a_reason(criterion: str, note: str) -> None:
    """Found in review: each of these was shown as a ✓ reason."""
    assert _evidence_for(criterion, note)["matched"] is False


@pytest.mark.parametrize(
    ("criterion", "note", "label"),
    [
        ("Kitchen experience", "Two years as a prep cook in a busy kitchen.", "Kitchen experience"),
        ("Kitchen experience", "No problem with weekends. A year in a hotel kitchen.", "Kitchen experience"),
        (
            "Kitchen experience",
            "I didn't finish college, but worked three years as a line cook.",
            "Line cook experience",
        ),
        ("Customer service experience", "Three years serving tables at a diner.", "Serving tables experience"),
    ],
)
def test_experience_said_plainly_is_a_reason(criterion: str, note: str, label: str) -> None:
    found = _evidence_for(criterion, note)
    assert (found["matched"], found["label"]) == (True, label)
