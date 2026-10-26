"""Candidate messaging, per application: off until a recruiter turns it on, and never across applications.

A candidate always reads what the hiring team sends. Writing back needs the recruiter's go-ahead for that
one application (applications.candidate_messaging_enabled), and a message only ever lands in the thread of
the application it was written in.
"""

from types import SimpleNamespace

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import ApplicationBucket, ApplicationStage
from app.db.seed_data import ANTHROPIC_RECRUITER, OPENAI_RECRUITER
from app.models import Application, CandidateActivity
from app.schemas.portal import PortalRecruiter
from app.services.candidate_portal_service import next_step
from app.services.candidate_visibility import PortalStatus
from app.services.message_service import email_text
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, link

ENCORD = application_id("sophia-martinez")  # she has written in it, so it's open
OPENAI = application_id("sophia-martinez@openai")  # off: the hiring team hasn't turned it on
ANTHROPIC = application_id("sophia-martinez@anthropic")
GRACE = application_id("grace-kim")
OFF = "Messaging will become available when the hiring team enables it."


async def write(client: AsyncClient, application: str, content: str = "Hello!") -> dict:
    response = await client.post(f"{API}/candidate/messages", json={"content": content, "application_id": application})
    return {"status": response.status_code, **response.json()}


async def test_messaging_is_off_until_the_recruiter_turns_it_on(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    julia = await link(sessions, OPENAI_RECRUITER["email"])  # OpenAI's recruiter: it's OpenAI's application
    thread = (await client.get(f"{API}/candidate/messages", params={"application_id": OPENAI})).json()
    assert thread["can_message"] is False
    me = (await client.get(f"{API}/candidate/me", params={"application_id": OPENAI})).json()
    assert me["application"]["messaging_enabled"] is False

    refused = await write(client, OPENAI)
    assert refused["status"] == 403
    assert refused["error"] == {"code": "messaging_disabled", "message": OFF, "details": None}
    # The hiring team can still write, and the candidate still reads it.
    sent = await client.post(
        f"{API}/applications/{OPENAI}/messages", json={"content": "Thanks for applying, Sophia."}, headers=julia
    )
    assert sent.status_code == 201
    thread = (await client.get(f"{API}/candidate/messages", params={"application_id": OPENAI})).json()
    assert thread["messages"][-1]["content"] == "Thanks for applying, Sophia." and thread["can_message"] is False

    # Another employer's recruiter can't: to them, it isn't there.
    assert (await client.put(f"{API}/applications/{OPENAI}/messaging", json={"enabled": True})).status_code == 404
    opened = await client.put(f"{API}/applications/{OPENAI}/messaging", json={"enabled": True}, headers=julia)
    assert opened.status_code == 200 and opened.json()["candidate_messaging_enabled"] is True
    assert (await client.get(f"{API}/candidate/messages", params={"application_id": OPENAI})).json()["can_message"]
    assert (await write(client, OPENAI, "Thank you! Happy to talk any time."))["status"] == 201

    # It reaches the recruiter's existing inbox, on that application's thread.
    inbox = (await client.get(f"{API}/messages/conversations", headers=julia)).json()
    conversation = next(item for item in inbox if item["candidate"]["application_id"] == OPENAI)
    assert conversation["messages"][-1]["content"] == "Thank you! Happy to talk any time."
    assert conversation["unread"] == 1


async def test_turning_it_off_stops_new_messages_but_keeps_the_thread(client: AsyncClient) -> None:
    before = (await client.get(f"{API}/candidate/messages", params={"application_id": ENCORD})).json()
    assert before["can_message"] is True and before["messages"]
    closed = await client.put(f"{API}/applications/{ENCORD}/messaging", json={"enabled": False})
    assert closed.json()["candidate_messaging_enabled"] is False
    after = (await client.get(f"{API}/candidate/messages", params={"application_id": ENCORD})).json()
    assert after["can_message"] is False and after["messages"] == before["messages"]
    assert (await write(client, ENCORD))["status"] == 403


async def test_one_application_never_opens_another(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    owen = await link(sessions, ANTHROPIC_RECRUITER["email"])
    julia = await link(sessions, OPENAI_RECRUITER["email"])
    await client.put(f"{API}/applications/{ANTHROPIC}/messaging", json={"enabled": True}, headers=owen)
    assert (await write(client, ANTHROPIC, "A question about the Anthropic role."))["status"] == 201
    assert (await write(client, OPENAI))["status"] == 403  # her other application is still off

    anthropic = (await client.get(f"{API}/applications/{ANTHROPIC}/messages", headers=owen)).json()
    assert anthropic[-1]["content"] == "A question about the Anthropic role."
    for other, recruiter in ((ENCORD, {}), (OPENAI, julia)):
        thread = (await client.get(f"{API}/applications/{other}/messages", headers=recruiter)).json()
        assert all(message["content"] != "A question about the Anthropic role." for message in thread)
        portal = (await client.get(f"{API}/candidate/messages", params={"application_id": other})).json()
        assert all(message["content"] != "A question about the Anthropic role." for message in portal["messages"])


async def test_bulk_changes_only_the_applications_picked(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    # Encord's recruiter picking one of OpenAI's applications changes nothing: it isn't in his workspace.
    mixed = await client.post(
        f"{API}/applications/messaging", json={"application_ids": [OPENAI, GRACE], "enabled": True}
    )
    assert mixed.status_code == 404
    response = await client.post(f"{API}/applications/messaging", json={"application_ids": [GRACE], "enabled": True})
    julia = await link(sessions, OPENAI_RECRUITER["email"])
    theirs = await client.post(
        f"{API}/applications/messaging", json={"application_ids": [OPENAI], "enabled": True}, headers=julia
    )
    assert response.status_code == theirs.status_code == 200
    assert [(item["application_id"], item["candidate_messaging_enabled"]) for item in response.json()] == [
        (GRACE, True)
    ]
    async with sessions() as session:
        enabled = {
            str(row)
            for row in await session.scalars(select(Application.id).where(Application.candidate_messaging_enabled))
        }
        assert {OPENAI, GRACE} <= enabled and ANTHROPIC not in enabled
        entries = await session.execute(
            select(CandidateActivity.application_id, CandidateActivity.title).where(
                CandidateActivity.activity_type == "candidate_messaging_enabled"
            )
        )
        assert sorted((str(app), title) for app, title in entries.all()) == sorted(
            [(OPENAI, "Candidate messaging turned on"), (GRACE, "Candidate messaging turned on")]
        )

    # The timeline entry is the recruiter's: the candidate's activity never shows it.
    activity = (await client.get(f"{API}/candidate/activity", params={"application_id": OPENAI})).json()
    assert all("messaging" not in entry["title"].lower() for entry in activity)


async def test_bulk_with_an_unknown_application_changes_nothing(client: AsyncClient) -> None:
    unknown = "00000000-0000-4000-8000-000000000000"
    response = await client.post(
        f"{API}/applications/messaging", json={"application_ids": [ANTHROPIC, unknown], "enabled": True}
    )
    assert response.status_code == 404
    assert (await write(client, ANTHROPIC))["status"] == 403


def test_candidates_are_only_told_to_reply_when_they_can() -> None:
    def application(enabled: bool) -> SimpleNamespace:
        job = SimpleNamespace(title="Product Designer", company=SimpleNamespace(name="Encord"))
        return SimpleNamespace(candidate_messaging_enabled=enabled, job=job)

    assert "To reply, or to see where your application stands" in email_text(application(True), "Hi")  # type: ignore[arg-type]
    assert "\n--\nTo see where your application stands" in email_text(application(False), "Hi")  # type: ignore[arg-type]
    alex = PortalRecruiter(name="Alex Chen", email="alex@example.com")
    offer = {
        "stage": ApplicationStage.OFFER,
        "status": PortalStatus(bucket=ApplicationBucket.ACTIVE, label="Offer"),
        "interview": None,
        "unread": 0,
        "recruiter": alex,
        "company": "Encord",
    }
    assert next_step(**offer) == "Review your offer, and message Alex with any questions."  # type: ignore[arg-type]
    closed = next_step(**offer, can_message=False)  # type: ignore[arg-type]
    assert closed == "Review your offer. Alex will be in touch to talk it through."


async def test_only_the_hiring_team_can_change_it(anonymous: AsyncClient) -> None:
    for method, path, body in (
        ("PUT", f"/applications/{OPENAI}/messaging", {"enabled": True}),
        ("POST", "/applications/messaging", {"application_ids": [OPENAI], "enabled": True}),
    ):
        response = await anonymous.request(method, f"{API}{path}", json=body, headers=bearer(SOPHIA_AUTH))
        assert response.status_code == 403
        assert (await anonymous.request(method, f"{API}{path}", json=body)).status_code == 401
