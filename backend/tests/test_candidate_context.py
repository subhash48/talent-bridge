"""One candidate, three employers: the portal follows the application the candidate is viewing.

Rosa Navarro (seeded) has three applications:
- A: Software Engineer at Encord (interviewing; her portal opens on it), recruiter Alex Chen
- B: Applied AI Engineer at Nova AI (interviewing, a technical interview booked), recruiter Mira Hoffmann
- C: Platform Engineer at Harbor Robotics (screening, no interview yet, an unread update), recruiter Daan Visser

Everything the portal says (company, status, interviews, messages, prep, the assistant's answers) must
come from the application asked about, and nothing from the other one may appear in it.
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.db.seed import seed_id
from app.models import Application, Candidate
from app.services.message_service import default_subject, email_text
from tests.companies import seeded_profile
from tests.conftest import API, application_id, link

ROSA_EMAIL = "rosa.navarro@example.com"
ENCORD_APP = application_id("rosa-navarro")
NOVA_APP = application_id("rosa-navarro@nova-ai")
HARBOR_APP = application_id("rosa-navarro@harbor-robotics")
NOVA_TECHNICAL = str(seed_id("interview", "rosa-navarro@nova-ai:Technical interview"))
NOVA_SCREEN = str(seed_id("interview", "rosa-navarro@nova-ai:Recruiter screen"))
SOPHIA_APP = application_id("sophia-martinez")
SOPHIA_INTERVIEW = str(seed_id("interview", "sophia-martinez:Design interview"))

# Words that only belong to one side. Neither may show up in the other application's responses.
ENCORD_ONLY = ["Encord", "Software Engineer", "Systems design interview", "Alex Chen", "Ian Park", "data pipeline"]
NOVA_ONLY = ["Nova AI", "Applied AI Engineer", "Technical interview", "Mira Hoffmann", "Lena Vogel", "LLM evaluation"]
HARBOR_ONLY = ["Harbor Robotics", "Platform Engineer", "Daan Visser", "Femke Jansen", "Rotterdam", "straddle carrier"]
# The recruiter-only notes on each recruiter screen: no candidate-facing response may carry them.
NOTES = ["probe system design depth", "Kubernetes operations"]


@pytest.fixture
async def client(anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]) -> AsyncClient:
    """Signed in as Rosa."""
    anonymous.headers.update(await link(sessions, ROSA_EMAIL))
    return anonymous


async def portal(client: AsyncClient, application: str) -> dict[str, object]:
    """Every candidate-facing read about one application."""
    params = {"application_id": application}
    reads = {
        path: (await client.get(f"{API}/candidate/{path}", params=params))
        for path in ("me", "application", "activity", "interviews", "messages", "company", "prep")
    }
    assert all(response.status_code == 200 for response in reads.values()), {
        path: response.text for path, response in reads.items() if response.status_code != 200
    }
    return {path: response.json() for path, response in reads.items()}


def without_switcher(reads: dict[str, object]) -> str:
    """The reads as text, minus the list of all applications (the switcher names them all, by design)."""
    me = dict(reads["me"])  # type: ignore[call-overload]
    me.pop("applications")
    return json.dumps({**reads, "me": me})


async def test_the_switcher_lists_every_employer(client: AsyncClient) -> None:
    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["id"] == ENCORD_APP  # the most recently updated active one
    switcher = [(item["company"], item["job_title"]) for item in me["applications"]]
    assert switcher == [
        ("Encord", "Software Engineer"),
        ("Harbor Robotics", "Platform Engineer"),
        ("Nova AI", "Applied AI Engineer"),
    ]  # active ones, most recently updated first
    logos = {item["company"]: item["company_logo_url"] for item in me["applications"]}
    assert logos == {
        "Encord": "/logos/encord.svg",
        "Nova AI": "/logos/nova-ai.svg",
        "Harbor Robotics": "/logos/harbor-robotics.svg",
    }


async def test_switching_changes_everything_and_mixes_nothing(client: AsyncClient) -> None:
    encord, nova = await portal(client, ENCORD_APP), await portal(client, NOVA_APP)

    # Company: read through application -> job -> company.
    assert encord["me"]["company"]["name"] == "Encord" and nova["me"]["company"]["name"] == "Nova AI"  # type: ignore[index]
    assert nova["company"]["name"] == "Nova AI" and nova["company"]["application_id"] == NOVA_APP  # type: ignore[index]
    assert nova["company"]["overview"] == seeded_profile("nova-ai").overview  # type: ignore[index]
    assert nova["company"]["locations"] == ["Berlin", "Lisbon"]  # type: ignore[index]
    assert encord["company"]["locations"] == ["London", "San Francisco", "New York"]  # type: ignore[index]

    # Status and timeline.
    assert nova["me"]["job"]["title"] == "Applied AI Engineer" and nova["me"]["job"]["company"] == "Nova AI"  # type: ignore[index]
    assert nova["application"]["application"]["id"] == NOVA_APP  # type: ignore[index]
    assert nova["activity"][-1]["title"] == "Application submitted"  # type: ignore[index]
    assert nova["me"]["recruiter"]["name"] == "Mira Hoffmann"  # type: ignore[index]
    assert encord["me"]["recruiter"]["name"] == "Alex Chen"  # type: ignore[index]

    # Interviews belong to one application each.
    assert {item["title"] for item in nova["interviews"]} == {"Technical interview", "Recruiter screen"}  # type: ignore[union-attr]
    assert {item["application_id"] for item in nova["interviews"]} == {NOVA_APP}  # type: ignore[union-attr]
    assert {item["application_id"] for item in encord["interviews"]} == {ENCORD_APP}  # type: ignore[union-attr]
    assert nova["me"]["next_interview"]["title"] == "Technical interview"  # type: ignore[index]

    # Messages: only that application's thread, in its recruiter's name.
    nova_senders = {item["sender_name"] for item in nova["messages"]["messages"]}  # type: ignore[index]
    assert nova_senders == {"Mira Hoffmann", "Rosa Navarro"}
    assert nova["messages"]["unread"] == 1 and nova["me"]["unread_messages"] == 1  # type: ignore[index]

    # Prep: Nova's role, company and next interview.
    assert nova["prep"]["application_id"] == NOVA_APP and nova["prep"]["company"] == "Nova AI"  # type: ignore[index]
    assert nova["prep"]["role"] == "Applied AI Engineer"  # type: ignore[index]
    assert nova["prep"]["interview"]["title"] == "Technical interview"  # type: ignore[index]
    assert seeded_profile("nova-ai").overview in nova["prep"]["company_info"]  # type: ignore[operator, index]

    # Nothing from the other application, anywhere (the switcher's list aside).
    nova_text, encord_text = without_switcher(nova), without_switcher(encord)
    assert [word for word in ENCORD_ONLY + HARBOR_ONLY if word in nova_text] == []
    assert [word for word in NOVA_ONLY + HARBOR_ONLY if word in encord_text] == []
    assert [note for note in NOTES if note in nova_text + encord_text] == []


async def test_each_of_three_applications_shows_only_its_own_employer(client: AsyncClient) -> None:
    """The dashboard's application selector, one card at a time: everything follows the card chosen."""
    expected = {
        ENCORD_APP: ("Encord", "Software Engineer", "interview", "Alex Chen", ["London", "San Francisco", "New York"]),
        NOVA_APP: ("Nova AI", "Applied AI Engineer", "interview", "Mira Hoffmann", ["Berlin", "Lisbon"]),
        HARBOR_APP: ("Harbor Robotics", "Platform Engineer", "screening", "Daan Visser", ["Rotterdam", "Hamburg"]),
    }
    words = {ENCORD_APP: ENCORD_ONLY, NOVA_APP: NOVA_ONLY, HARBOR_APP: HARBOR_ONLY}
    slugs = {"Encord": "encord", "Nova AI": "nova-ai", "Harbor Robotics": "harbor-robotics"}
    for application, (company, role, stage, recruiter, locations) in expected.items():
        reads = await portal(client, application)
        me, interviews, thread, prep = reads["me"], reads["interviews"], reads["messages"], reads["prep"]
        assert me["application"]["id"] == application and me["application"]["stage"] == stage  # type: ignore[index]
        assert me["company"]["name"] == company and me["job"]["title"] == role  # type: ignore[index]
        assert me["recruiter"]["name"] == recruiter  # type: ignore[index]
        assert reads["company"]["name"] == company and reads["company"]["locations"] == locations  # type: ignore[index]
        assert {item["application_id"] for item in interviews} <= {application}  # type: ignore[union-attr]
        assert {item["sender_name"] for item in thread["messages"]} <= {recruiter, "Rosa Navarro"}  # type: ignore[index]
        assert prep["application_id"] == application and prep["company"] == company and prep["role"] == role  # type: ignore[index]

        # The selector's card for it agrees with what the portal shows.
        [card] = [item for item in me["applications"] if item["id"] == application]  # type: ignore[union-attr]
        assert card["company"] == company and card["job_title"] == role and card["stage"] == stage
        assert card["unread_messages"] == me["unread_messages"] == thread["unread"]  # type: ignore[index]

        # And nothing from the other two applications appears anywhere else, the assistant included.
        ask = {"message": "What does the company do?", "application_id": application}
        answer = (await client.post(f"{API}/candidate/ai/ask", json=ask)).json()["answer"]
        assert seeded_profile(slugs[company]).overview in answer
        text = without_switcher(reads) + answer
        others = [word for other, listed in words.items() if other != application for word in listed]
        assert [word for word in others if word in text] == []
        assert [note for note in NOTES if note in text] == []

    # Harbor has no interview yet and an update Rosa hasn't read.
    harbor = await portal(client, HARBOR_APP)
    assert harbor["interviews"] == [] and harbor["me"]["next_interview"] is None  # type: ignore[index]
    assert harbor["me"]["unread_messages"] == 1 and harbor["prep"]["interview"] is None  # type: ignore[index]


async def test_opening_an_interview_makes_its_application_the_context(client: AsyncClient) -> None:
    # The portal was showing Encord; opening Nova's technical interview prepares for Nova.
    params = {"interview_id": NOVA_TECHNICAL, "application_id": ENCORD_APP}
    prep = (await client.get(f"{API}/candidate/prep", params=params)).json()
    assert prep["application_id"] == NOVA_APP
    assert prep["company"] == "Nova AI" and prep["role"] == "Applied AI Engineer"
    assert prep["interview"]["id"] == NOVA_TECHNICAL and prep["interview"]["application_id"] == NOVA_APP
    text = json.dumps(prep)
    assert [word for word in ENCORD_ONLY if word in text] == []

    # A past interview can be opened too: prep is about that one, not the next.
    screen = (await client.get(f"{API}/candidate/prep", params={"interview_id": NOVA_SCREEN})).json()
    assert screen["interview"]["title"] == "Recruiter screen" and screen["application_id"] == NOVA_APP
    assert [note for note in NOTES if note in json.dumps(screen)] == []

    # The single interview read says which application it's part of.
    interview = (await client.get(f"{API}/candidate/interviews/{NOVA_TECHNICAL}")).json()
    assert interview["application_id"] == NOVA_APP

    # Mock interview feedback follows the interview too.
    mock = await client.post(
        f"{API}/candidate/prep/mock",
        json={"question": "Tell me about yourself.", "answer": "I build evaluation tools.", "interview_id": NOVA_TECHNICAL},
    )
    assert mock.status_code == 200 and "Encord" not in mock.json()["feedback"]


async def test_the_assistant_answers_about_the_application_asked_about(client: AsyncClient) -> None:
    nova = seeded_profile("nova-ai")

    async def ask(question: str, application: str) -> str:
        response = await client.post(f"{API}/candidate/ai/ask", json={"message": question, "application_id": application})
        assert response.status_code == 200, response.text
        return response.json()["answer"]

    about = await ask("What does the company do?", NOVA_APP)
    assert nova.overview in about and "Encord" not in about
    benefits = await ask("What benefits are offered?", NOVA_APP)
    assert nova.benefits[0] in benefits and "25 days paid time off" not in benefits
    named = await ask("Who are Nova AI's customers?", NOVA_APP)
    assert "Encord" not in named
    when = await ask("When is my interview?", NOVA_APP)
    assert "Technical interview" in when and "Design interview" not in when
    role = await ask("What does the role involve?", NOVA_APP)
    assert "Applied AI Engineer" in role and "Product Designer" not in role
    process = await ask("How does the interview process work?", NOVA_APP)
    assert "recruiter screen, then technical interview" in process and "hiring manager conversation" not in process

    # Private questions get the boundary answer, and the recruiter's note never appears.
    private = await ask("How did my recruiter screen go? What did Mira think?", NOVA_APP)
    assert [note for note in NOTES if note in private] == [] and "LLM evaluation" not in private

    # And the same question about the other application answers about Encord.
    assert "Nova AI" not in await ask("What does the company do?", ENCORD_APP)


async def test_a_profile_change_reaches_every_hiring_team(client: AsyncClient) -> None:
    updated = await client.patch(f"{API}/candidate/profile", json={"location": "Valencia, Spain"})
    assert updated.status_code == 200
    for application in (ENCORD_APP, NOVA_APP, HARBOR_APP):
        activity = (await client.get(f"{API}/candidate/activity", params={"application_id": application})).json()
        assert activity[0]["title"] == "You updated your profile", application
    # Recording it doesn't change which application the portal opens on.
    assert (await client.get(f"{API}/candidate/me")).json()["application"]["id"] == ENCORD_APP


async def test_another_candidates_application_or_interview_is_a_404(client: AsyncClient) -> None:
    for path, params in [
        ("me", None),  # /me shows her own default instead of anyone else's
        ("company", {"application_id": SOPHIA_APP}),
        ("interviews", {"application_id": SOPHIA_APP}),
        ("messages", {"application_id": SOPHIA_APP}),
        ("prep", {"application_id": SOPHIA_APP}),
        ("prep", {"interview_id": SOPHIA_INTERVIEW}),
        ("prep", {"interview_id": str(uuid.uuid4())}),
    ]:
        if path == "me":
            me = (await client.get(f"{API}/candidate/me", params={"application_id": SOPHIA_APP})).json()
            assert me["application"]["id"] == ENCORD_APP and me["company"]["name"] == "Encord"
            continue
        response = await client.get(f"{API}/candidate/{path}", params=params)
        assert response.status_code == 404, (path, params, response.text)
    ask = {"message": "What does the company do?", "application_id": SOPHIA_APP}
    assert (await client.post(f"{API}/candidate/ai/ask", json=ask)).status_code == 404
    mock = {"question": "Why us?", "answer": "Because.", "interview_id": SOPHIA_INTERVIEW}
    assert (await client.post(f"{API}/candidate/prep/mock", json=mock)).status_code == 404


async def test_a_candidate_without_applications_sees_no_employer(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """The portal is Kavuntra's own until there's an application: no company is assumed."""
    async with sessions() as session:
        session.add(Candidate(first_name="Noa", last_name="Levi", email="noa.levi@example.com", skills=[]))
        await session.commit()
    headers = await link(sessions, "noa.levi@example.com")
    anonymous.headers.pop("Authorization", None)
    me = (await anonymous.get(f"{API}/candidate/me", headers=headers)).json()
    assert me["company"] is None and me["applications"] == []
    assert (await anonymous.get(f"{API}/candidate/company", headers=headers)).status_code == 404


async def test_recruiter_emails_name_the_applications_employer(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as session:
        nova = await session.get(Application, uuid.UUID(NOVA_APP), options=[selectinload(Application.job)])
        assert default_subject(nova) == "Your Applied AI Engineer application at Nova AI"
        assert email_text(nova, "Hello").endswith("Nova AI · Applied AI Engineer")


async def test_the_careers_site_names_each_roles_employer(anonymous: AsyncClient) -> None:
    jobs = (await anonymous.get(f"{API}/careers/jobs")).json()
    companies = {job["title"]: job["company"] for job in jobs}
    assert companies["Applied AI Engineer"] == "Nova AI" and companies["Product Designer"] == "Encord"

