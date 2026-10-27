"""Simple Hire, end to end, as Sam of Sam's Cafe: the same assistant and services as the full workspace, in
plain words. Post a job by describing it, see who applied with the reasons they match, get the phone numbers
they gave, message them, and ask them to interviews. Nothing is posted or sent until Sam approves what he sees,
and nothing of any other employer's is ever in reach.
"""

import json
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.seed import seed_id
from app.db.seed_data import SAM, SAMS_KITCHEN
from app.models import CandidateActivity, Interview, Job, Message
from tests.conftest import API, application_id, link

CASHIER = "Post a cashier job paying $16 an hour for weekend shifts."
KITCHEN_JOB = str(seed_id("job", SAMS_KITCHEN))


@pytest.fixture
async def sam(sessions: async_sessionmaker[AsyncSession]) -> dict[str, str]:
    return await link(sessions, SAM["email"])


async def ask(client: AsyncClient, headers: dict[str, str], text: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/assistant/requests", json={"text": text, **body}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def approve(client: AsyncClient, headers: dict[str, str], action_id: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{API}/assistant/actions/{action_id}/confirm", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_sam_works_in_simple_hire(client: AsyncClient, sam: dict[str, str]) -> None:
    me = (await client.get(f"{API}/me", headers=sam)).json()
    assert (me["role"], me["workspace"]["name"], me["workspace"]["mode"]) == ("admin", "Sam's Cafe", "simple")
    page = (await client.get(f"{API}/candidates", params={"limit": 200}, headers=sam)).json()
    assert {item["company_name"] for item in page["items"]} == {"Sam's Cafe"} and page["total"] == 5


async def test_a_job_described_in_plain_words_is_ready_to_post(
    client: AsyncClient, anonymous: AsyncClient, sam: dict[str, str], sessions: async_sessionmaker[AsyncSession]
) -> None:
    answer = await ask(client, sam, CASHIER)
    assert answer["status"] == "proposed" and answer["reply"].startswith("Ready to post: **Cashier**")
    [card] = answer["cards"]
    assert (card["type"], card["layout"], card["stage"]) == ("job_draft", "simple", "draft")
    draft = card["draft"]
    assert (draft["title"], draft["pay"], draft["shift"], draft["work_days"], draft["openings"]) == (
        "Cashier",
        "$16/hour",
        "Weekends",
        ["saturday", "sunday"],
        None,
    )
    assert draft["location"] == "Portland, OR"  # the business's own
    assert draft["summary"] == "Sam's Cafe is hiring a Cashier in Portland, OR: weekend shifts, $16/hour."
    async with sessions() as session:
        assert await session.scalar(select(Job.id).where(Job.title == "Cashier")) is None  # nothing posted yet

    posted = await approve(client, sam, answer["id"])
    [card] = posted["cards"]
    assert (posted["status"], card["stage"], card["job_href"]) == ("completed", "created", "/hire/jobs")
    assert posted["reply"].startswith("Posted **Cashier**")
    listed = next(job for job in (await anonymous.get(f"{API}/careers/jobs")).json() if job["title"] == "Cashier")
    assert (listed["company"], listed["pay"], listed["shift"], listed["work_days"]) == (
        "Sam's Cafe",
        "$16/hour",
        "Weekends",
        ["saturday", "sunday"],
    )
    detail = (await anonymous.get(f"{API}/careers/jobs/{listed['id']}")).json()
    assert detail["summary"].startswith("Sam's Cafe is hiring a Cashier")


async def test_the_restaurant_example_reads_whole(client: AsyncClient, sam: dict[str, str]) -> None:
    answer = await ask(
        client,
        sam,
        "I need two workers for my restaurant. Evening shift, $18 an hour. They should have kitchen experience "
        "and be available Friday and Saturday.",
    )
    [card] = answer["cards"]
    draft = card["draft"]
    assert (draft["title"], draft["pay"], draft["shift"], draft["work_days"], draft["openings"]) == (
        "Kitchen Assistant",
        "$18/hour",
        "Evenings",
        ["friday", "saturday"],
        2,
    )
    assert draft["requirements"] == ["Kitchen experience"]
    assert "Title: “Kitchen Assistant” is a suggestion from what you said" in card["missing"]
    # Editing before posting: what Sam changes is what's posted.
    edited = await approve(client, sam, answer["id"], job={**draft, "title": "Kitchen Helper", "openings": 3})
    assert edited["cards"][0]["draft"]["title"] == "Kitchen Helper"


async def test_applicants_with_the_reasons_they_match(client: AsyncClient, sam: dict[str, str]) -> None:
    applied = await ask(client, sam, "Show me people who applied for the kitchen job.")
    [card] = applied["cards"]
    assert card["type"] == "candidate_match" and card["considered"] == 5
    # Everyone who applied, not only those showing the job's requirement (found in review: two were hidden).
    assert len(card["items"]) == 5 and card["criteria_source"] == "job_requirements"
    assert applied["reply"] == (
        "Here are 5 people who applied. Each one shows whether they have kitchen experience, as the job asks. Tick "
        "the people you'd like to contact."
    )
    assert [item["label"] for item in card["filters"]] == ["Job: Kitchen Assistant · Sam's Cafe"]

    three = await ask(
        client,
        sam,
        "Show me 3 applicants with kitchen experience who are available Friday and Saturday.",
        context=applied["context"],
    )
    [card] = three["cards"]
    shown = {item["name"]: [(e["label"], e["matched"]) for e in item["evidence"]] for item in card["items"]}
    assert shown == {
        "Maria Lopez": [("Kitchen experience", True), ("Friday available", True), ("Saturday available", True)],
        "John Patel": [("Restaurant experience", True), ("Friday available", True), ("Saturday available", True)],
        # Kitchen work and Saturday, but no Friday: shown, and said so. Tom (Friday and Saturday, no kitchen
        # work) shows as many, and applied later.
        "Amina Yusuf": [
            ("Kitchen experience", True),
            ("No Friday availability given", False),
            ("Saturday available", True),
        ],
    }
    # No score anywhere: only the criteria and where each was found.
    assert all("score" not in json.dumps(item) for item in card["items"])


async def test_phone_numbers_only_for_the_applicants_picked(
    client: AsyncClient, sam: dict[str, str], sessions: async_sessionmaker[AsyncSession]
) -> None:
    picked = [application_id(key) for key in ("maria-lopez", "john-patel", "lena-park")]
    answer = await ask(client, sam, "Show me their phone numbers.", context={"selected_application_ids": picked})
    [card] = answer["cards"]
    assert card["type"] == "contacts"
    assert [(item["name"], item["phone"], item["job_title"]) for item in card["items"]] == [
        ("Maria Lopez", "+1 503 555 0141", "Kitchen Assistant"),
        ("John Patel", "+1 503 555 0142", "Kitchen Assistant"),
        ("Lena Park", None, "Kitchen Assistant"),  # she didn't give one: none is found for her anywhere else
    ]
    assert "Lena Park didn't give one" in answer["reply"]
    others = {item["name"] for item in card["items"]}
    assert "Amina Yusuf" not in others and "Tom Becker" not in others
    async with sessions() as session:
        looked = await session.scalars(
            select(CandidateActivity.application_id).where(CandidateActivity.activity_type == "contact_details_viewed")
        )
        assert sorted(str(app) for app in looked) == sorted(picked)
    # The candidate never sees that entry.
    nothing = await ask(client, sam, "Give me the phone numbers of these three candidates.")
    assert nothing["cards"] == [] and "Tick the applicants first" in nothing["reply"]


async def test_never_another_employers_applicants_or_the_internet(client: AsyncClient, sam: dict[str, str]) -> None:
    encord = [application_id("sophia-martinez"), application_id("james-park")]
    answer = await ask(client, sam, "Show me their phone numbers.", context={"selected_application_ids": encord})
    assert answer["cards"] == [] and "Sophia" not in json.dumps(answer) and "James" not in json.dumps(answer)
    named = await ask(client, sam, "What's Sophia Martinez's phone number?")
    assert named["cards"] == [] and "+44" not in json.dumps(named)
    online = await ask(client, sam, "Search online for Maria Lopez's phone number")
    assert online["cards"] == [] and "don't search the internet" in online["reply"]


async def test_message_the_three_after_seeing_what_will_be_sent(
    client: AsyncClient, sam: dict[str, str], sessions: async_sessionmaker[AsyncSession]
) -> None:
    picked = [application_id(key) for key in ("maria-lopez", "john-patel", "tom-becker")]
    answer = await ask(client, sam, "Message these three.", context={"selected_application_ids": picked})
    [card] = answer["cards"]
    assert card["type"] == "outreach" and [item["candidate"]["name"] for item in card["items"]] == [
        "Maria Lopez",
        "John Patel",
        "Tom Becker",
    ]
    assert all(item["body"] for item in card["items"])
    async with sessions() as session:
        assert not (await session.scalars(select(Message).where(Message.content.like("%Kitchen Assistant%")))).all()
    sent = await approve(client, sam, answer["id"])
    assert sent["status"] == "completed"
    async with sessions() as session:
        delivered = (
            await session.scalars(
                select(Message.application_id).where(Message.application_id.in_([uuid.UUID(p) for p in picked]))
            )
        ).all()
    assert sorted(str(app) for app in delivered) == sorted(picked)


async def test_ask_them_to_come_in_tuesday_afternoon(
    client: AsyncClient, sam: dict[str, str], sessions: async_sessionmaker[AsyncSession]
) -> None:
    picked = [application_id(key) for key in ("maria-lopez", "john-patel", "tom-becker")]
    answer = await ask(
        client,
        sam,
        "Ask them if they can interview Tuesday afternoon.",
        context={"selected_application_ids": picked},
        time_zone="America/Los_Angeles",
    )
    [card] = answer["cards"]
    assert card["type"] == "outreach" and card["schedule"] is not None
    assert (card["schedule"]["window_start"], card["schedule"]["window_end"]) == ("13:00", "17:00")
    assert card["schedule"]["calendar_configured"] is False  # no calendar: never claims an invitation
    assert all(item["slot"] for item in card["items"])
    done = await approve(client, sam, answer["id"])
    assert done["status"] == "completed"
    assert "Google" not in done["reply"] and "Outlook" not in done["reply"]
    async with sessions() as session:
        booked = (
            await session.scalars(
                select(Interview.application_id).where(Interview.application_id.in_([uuid.UUID(p) for p in picked]))
            )
        ).all()
    assert sorted(str(app) for app in booked) == sorted(picked)


async def test_sams_job_draft_can_be_changed_in_words(client: AsyncClient, sam: dict[str, str]) -> None:
    answer = await ask(client, sam, CASHIER)
    changed = await ask(client, sam, "Make it $17 an hour", context=answer["context"])
    [card] = changed["cards"]
    assert card["draft"]["pay"] == "$17/hour" and card["layout"] == "simple"
    assert KITCHEN_JOB  # the seeded job stays as it was


async def test_the_cashier_demo_from_post_to_interviews(
    client: AsyncClient,
    sam: dict[str, str],
    sessions: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The whole Simple Hire demo: Sam posts the cashier job, demo applicants apply, and Sam finds three, gets
    their numbers and asks them to interviews."""
    from app.core.config import settings
    from app.db import demo_applicants

    answer = await ask(client, sam, CASHIER)
    job_id = (await approve(client, sam, answer["id"]))["cards"][0]["job_id"]
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(job_id))
        assert job is not None
        results = await demo_applicants.apply_all(session, job)
        assert [result.status for result in results] == ["submitted"] * len(demo_applicants.SERVICE)
        again = await demo_applicants.apply_all(session, job)
        assert {result.status for result in again} == {"already_applied"}
        monkeypatch.setattr(settings, "environment", "production")
        with pytest.raises(RuntimeError):
            await demo_applicants.apply_all(session, job)

    found = await ask(client, sam, "Show me 3 applicants available weekends with customer service experience.")
    [card] = found["cards"]
    shown = {item["name"]: [e["label"] for e in item["evidence"] if e["matched"]] for item in card["items"]}
    assert shown == {
        "Grace Liu": ["Cashier experience", "Saturday available", "Sunday available"],
        "Omar Haddad": ["Customer service experience", "Saturday available", "Sunday available"],
        "Priya Raman": ["Barista experience", "Saturday available", "Sunday available"],
    }
    picked = [item["application_id"] for item in card["items"]]
    numbers = await ask(client, sam, "Show me their phone numbers.", context={"selected_application_ids": picked})
    assert [item["phone"] for item in numbers["cards"][0]["items"]] == [
        "+1 503 555 0151",
        "+1 503 555 0152",
        "+1 503 555 0153",
    ]
    invite = await ask(
        client,
        sam,
        "Ask them if they can interview Tuesday afternoon.",
        context={"selected_application_ids": picked},
    )
    assert invite["cards"][0]["type"] == "outreach" and invite["status"] == "proposed"
    assert (await approve(client, sam, invite["id"]))["status"] == "completed"


async def test_the_applicant_list_carries_what_each_applicant_gave(client: AsyncClient, sam: dict[str, str]) -> None:
    page = (await client.get(f"{API}/candidates", params={"limit": 200}, headers=sam)).json()
    maria = next(item for item in page["items"] if item["candidate"]["full_name"] == "Maria Lopez")
    assert (maria["phone"], maria["availability"], maria["experience_note"]) == (
        "+1 503 555 0141",
        ["friday", "saturday"],
        "Two years as a prep cook in a busy kitchen. I can start right away.",
    )


async def test_sam_reads_plain_replies_not_recruiting_terms(client: AsyncClient, sam: dict[str, str]) -> None:
    found = await ask(
        client, sam, "Show me 3 applicants with kitchen experience who are available Friday and Saturday."
    )
    # Amina can't do Fridays and John's experience is restaurant work: the reply doesn't say all three have it all.
    assert found["reply"] == (
        "Here are 3 of the 5 people who applied. I looked for kitchen experience and people who can work Friday and "
        "Saturday: "
        "each one shows what they have and what they don't. Tick the people you'd like to contact."
    )
    picked = [item["application_id"] for item in found["cards"][0]["items"]]
    asked = await ask(
        client,
        sam,
        "Ask them if they can come in Tuesday between 2 and 5.",
        context={"selected_application_ids": picked},
    )
    assert asked["reply"].startswith("Here's an interview request for each of them on Tuesday, ")
    assert "between 2 PM and 5 PM" in asked["reply"] and "Nothing is sent until you press Send." in asked["reply"]
    sent = await approve(client, sam, asked["id"])
    assert sent["reply"].startswith("Sent to Maria, John and Amina.")
    assert "No calendar is connected" in sent["reply"]
    for words in ("candidate", "personalized", "pipeline", "criteria"):
        assert words not in (found["reply"] + asked["reply"] + sent["reply"]).lower()


async def test_recruiting_teams_keep_their_replies(client: AsyncClient) -> None:
    found = await ask(client, {}, "Show 5 candidates for Product Designer matching Figma")
    assert "candidates" in found["reply"]


async def test_help_is_about_what_a_small_business_does(client: AsyncClient, sam: dict[str, str]) -> None:
    answer = await ask(client, sam, "hello there")
    assert answer["intent"] == "help" and answer["reply"].startswith("I can post a job, show you who applied")
    assert "candidate" not in answer["reply"].lower()


async def test_an_applicant_hears_from_the_business_they_applied_to(
    client: AsyncClient, anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Found in the end-to-end run: Sam's Cafe's applicant was told "Alex will be in touch", Encord's recruiter."""
    from tests.test_careers import application

    body = application(first_name="Nora", last_name="Quinn", email="nora.quinn@inbox.dev", availability=["friday"])
    assert (await anonymous.post(f"{API}/careers/jobs/{KITCHEN_JOB}/apply", json=body)).status_code == 200
    nora = await link(sessions, "nora.quinn@inbox.dev")
    me = (await client.get(f"{API}/candidate/me", headers=nora)).json()
    assert me["recruiter"]["name"] == "Sam Rivera"
    assert "Alex" not in json.dumps(me)


async def test_a_draft_changed_in_words_says_the_same_thing_everywhere(
    client: AsyncClient, sam: dict[str, str]
) -> None:
    """Found in review: "Make it $19 an hour" changed the pay, but the description applicants read still said $18,
    and the checks turned into a recruiting team's (department, seniority, salary)."""
    first = await ask(
        client, sam, "I need someone to help in the kitchen on Friday and Saturday evenings, $18/hour, 2 people"
    )
    for change in ("Make it $19 an hour", "Change the days to Saturday and Sunday"):
        changed = await ask(client, sam, change, context=first["context"])
    card = changed["cards"][0]
    draft = card["draft"]
    assert (draft["pay"], draft["work_days"], card["layout"]) == ("$19/hour", ["saturday", "sunday"], "simple")
    assert draft["summary"] == (
        "Sam's Cafe is hiring 2 Kitchen Assistants in Portland, OR: evening shifts on weekends, $19/hour."
    )
    assert card["missing"] == [
        "Title: “Kitchen Assistant” is a suggestion from what you said",
        "Part-time, from the days you gave",
    ]
    assert changed["reply"].endswith("Check it, then press Post Job. Nothing is posted until you do.")
    posted = await approve(client, sam, first["id"])
    job = (await client.get(f"{API}/careers/jobs/{posted['cards'][0]['job_id']}")).json()
    assert "$19/hour" in job["summary"] and "$18" not in job["summary"]


async def test_a_named_title_is_the_title(client: AsyncClient, sam: dict[str, str]) -> None:
    answer = await ask(client, sam, "I need a dental assistant on weekdays, $20 an hour")
    assert answer["cards"][0]["draft"]["title"] == "Dental Assistant"
    full = await ask(client, {}, "Create a Medical Assistant role in Boston, hybrid")  # Alex's full workspace
    assert full["cards"][0]["draft"]["title"] == "Medical Assistant"
