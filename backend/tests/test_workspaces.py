"""Workspaces: an employer sees its own jobs and their applicants, and nothing of anyone else's.

Alex Chen hires for Encord; Julia Moreno for OpenAI, where Sophia Martinez also applied. Every recruiter
route is checked as Julia: lists leave Encord out, and an Encord id answers 404 as if it didn't exist.
The candidate portal isn't a workspace: Sophia sees all four of her applications.
"""

import json
import re
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import UserRole
from app.core.tenancy import scope_to
from app.db.seed import seed_id
from app.db.seed_data import OPENAI_RECRUITER, SAM, SAMS_KITCHEN
from app.main import app
from app.models import Application, Company, Job, Message, User
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer, candidate_id, job_id, link

SOPHIA_ENCORD = application_id("sophia-martinez")
SOPHIA_OPENAI = application_id("sophia-martinez@openai")
JAMES = application_id("james-park")
# Things only Encord's workspace has: a response to another employer that mentions one leaked it.
ENCORD_ONLY = ("Encord", "James Park", "Priya Desai", "Daniel Lee", "ML Engineer")


@pytest.fixture
async def julia(sessions: async_sessionmaker[AsyncSession]) -> dict[str, str]:
    """Signed in as OpenAI's recruiter."""
    return await link(sessions, OPENAI_RECRUITER["email"])


def leaked(body: Any) -> list[str]:
    text = json.dumps(body)
    return [word for word in ENCORD_ONLY if word in text]


async def test_each_employer_sees_only_its_own_pipeline(client: AsyncClient, julia: dict[str, str]) -> None:
    page = (await client.get(f"{API}/candidates", params={"limit": 200}, headers=julia)).json()
    assert [(item["candidate"]["full_name"], item["company_name"]) for item in page["items"]] == [
        ("Sophia Martinez", "OpenAI")
    ]
    jobs = (await client.get(f"{API}/jobs", headers=julia)).json()
    assert {job["title"] for job in jobs} == {"Product Designer"}
    assert all(job["id"] != job_id("Product Designer") for job in jobs)  # OpenAI's, not Encord's

    # Alex's workspace is Encord's alone.
    alex = (await client.get(f"{API}/candidates", params={"limit": 200})).json()
    assert {item["company_name"] for item in alex["items"]} == {"Encord"}
    assert SOPHIA_OPENAI not in {item["application_id"] for item in alex["items"]}


def _recruiter_get_routes() -> list[str]:
    """Every GET path of the recruiter workspace, from the API's own schema."""
    skip = ("/candidate/", "/careers", "/demo", "/integrations", "/accounts", "/workspace/setup", "/contact")
    paths = []
    for path, operations in app.openapi()["paths"].items():
        local = path.removeprefix(API)
        if "get" not in operations or not path.startswith(API) or local == "/me" or local.startswith(skip):
            continue
        paths.append(path)
    return paths


async def test_every_list_hides_other_workspaces(client: AsyncClient, julia: dict[str, str]) -> None:
    checked = 0
    for path in _recruiter_get_routes():
        if "{" in path:
            continue
        response = await client.get(path, headers=julia)
        assert response.status_code == 200, path
        if response.headers.get("content-type", "").startswith("application/json"):
            assert leaked(response.json()) == [], path
        checked += 1
    assert checked >= 10


async def test_another_workspaces_ids_are_not_found(
    client: AsyncClient, julia: dict[str, str], sessions: async_sessionmaker[AsyncSession]
) -> None:
    interview = (await client.get(f"{API}/interviews")).json()[0]["id"]
    draft = (await client.post(f"{API}/communication/drafts", json={"application_id": JAMES})).json()["id"]
    ids = {
        "application_id": JAMES,
        "candidate_id": candidate_id("james-park"),
        "job_id": job_id("ML Engineer"),
        "interview_id": interview,
        "draft_id": draft,
        "resume_id": str(uuid.uuid4()),
    }
    for template in _recruiter_get_routes():
        names = re.findall(r"{(\w+)}", template)
        if not names:
            continue
        path = template.format(**{name: ids[name] for name in names})
        response = await client.get(path, headers=julia)
        assert response.status_code == 404, path
        assert leaked(response.json()) == [], path

    writes: list[tuple[str, str, dict[str, Any]]] = [
        ("PATCH", f"/applications/{JAMES}/stage", {"stage": "screening"}),
        ("POST", f"/applications/{JAMES}/archive", {}),
        ("POST", f"/applications/{JAMES}/restore", {}),
        ("PUT", f"/applications/{JAMES}/messaging", {"enabled": True}),
        ("POST", "/applications/messaging", {"application_ids": [JAMES], "enabled": True}),
        ("POST", f"/applications/{JAMES}/messages", {"content": "Hello from another company"}),
        ("POST", f"/applications/{JAMES}/messages/read", {}),
        (
            "POST",
            f"/applications/{JAMES}/interviews",
            {"title": "Screen", "interview_type": "video", "scheduled_at": "2030-01-07T15:00:00Z"},
        ),
        ("PATCH", f"/interviews/{interview}", {"status": "cancelled"}),
        ("POST", "/communication/drafts", {"application_id": JAMES}),
        ("PATCH", f"/communication/drafts/{draft}", {"subject": "Hi", "body": "Hello"}),
        ("POST", f"/communication/drafts/{draft}/send", {}),
        ("POST", f"/communication/drafts/{draft}/discard", {}),
        ("PATCH", f"/jobs/{job_id('ML Engineer')}", {"status": "closed"}),
        ("POST", f"/candidates/{candidate_id('james-park')}/portal-invite", {}),
        ("POST", "/assistant/outreach", {"application_ids": [JAMES]}),
        ("POST", "/ai/draft-message", {"application_id": JAMES, "purpose": "custom", "instructions": "Hi"}),
    ]
    for method, path, body in writes:
        response = await client.request(method, f"{API}{path}", json=body, headers=julia)
        assert response.status_code == 404, f"{method} {path}: {response.status_code} {response.text[:200]}"
        assert leaked(response.json()) == [], path

    # Nothing changed for Encord: the draft is still waiting, James is where he was.
    drafts = (await client.get(f"{API}/communication/drafts", params={"application_id": JAMES})).json()
    assert [item["id"] for item in drafts] == [draft]
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(job_id("ML Engineer")))
        assert job is not None and job.status.value == "open"


async def test_matching_and_the_assistant_stay_in_the_workspace(client: AsyncClient, julia: dict[str, str]) -> None:
    matched = (
        await client.post(f"{API}/candidates/match", json={"skills": ["Figma"], "limit": 200}, headers=julia)
    ).json()
    assert {item["company_name"] for item in matched["items"]} <= {"OpenAI"}
    answer = (
        await client.post(f"{API}/assistant/requests", json={"text": "Tell me about James Park"}, headers=julia)
    ).json()
    # Only the name Julia typed comes back: nothing about him.
    assert "couldn't find" in answer["reply"] and answer["cards"] == []
    assert leaked({**answer, "transcript": "", "reply": ""}) == []
    who = (await client.post(f"{API}/assistant/requests", json={"text": "Who needs an update?"}, headers=julia)).json()
    assert leaked(who) == []


async def test_sla_rules_are_each_workspaces_own(client: AsyncClient, julia: dict[str, str]) -> None:
    changed = await client.put(
        f"{API}/communication/rules/no_recent_update", json={"enabled": False, "threshold_hours": 48}, headers=julia
    )
    assert changed.status_code == 200
    theirs = {rule["key"]: rule for rule in (await client.get(f"{API}/communication/rules", headers=julia)).json()}
    ours = {rule["key"]: rule for rule in (await client.get(f"{API}/communication/rules")).json()}
    assert (theirs["no_recent_update"]["enabled"], theirs["no_recent_update"]["threshold_hours"]) == (False, 48)
    assert (ours["no_recent_update"]["enabled"], ours["no_recent_update"]["threshold_hours"]) == (True, 120)


async def test_a_new_job_belongs_to_the_workspace_that_made_it(client: AsyncClient, julia: dict[str, str]) -> None:
    created = await client.post(f"{API}/jobs", json={"title": "Research Engineer", "status": "open"}, headers=julia)
    assert created.status_code == 201
    assert created.json()["id"] not in {job["id"] for job in (await client.get(f"{API}/jobs")).json()}
    listed = (await client.get(f"{API}/careers/jobs")).json()
    assert next(job for job in listed if job["id"] == created.json()["id"])["company"] == "OpenAI"


async def test_staff_without_a_workspace_are_refused(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    async with sessions() as session:
        session.add(User(email="lone.recruiter@example.org", full_name="Lone Recruiter", role=UserRole.RECRUITER))
        await session.commit()
    lone = await link(sessions, "lone.recruiter@example.org")
    refused = await client.get(f"{API}/candidates", headers=lone)
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "workspace_missing"
    assert (await client.get(f"{API}/me", headers=lone)).status_code == 200


async def test_the_candidate_portal_spans_every_employer(client: AsyncClient) -> None:
    mine = (await client.get(f"{API}/candidate/applications")).json()
    assert {"Encord", "OpenAI", "Anthropic", "Google"} <= {item["company"] for item in mine}


async def test_unscoped_sessions_are_unchanged(sessions: async_sessionmaker[AsyncSession]) -> None:
    """Only recruiter requests are scoped: a plain session (the portal, the careers site) sees every row."""
    async with sessions() as session:
        companies = {job.company.name for job in await session.scalars(select(Job))}
    assert {"Encord", "OpenAI"} <= companies


async def test_a_scoped_bulk_change_reaches_only_its_own_workspace(sessions: async_sessionmaker[AsyncSession]) -> None:
    """An UPDATE or DELETE written without a workspace in mind still can't touch another employer's rows."""
    async with sessions() as session:
        openai = await session.scalar(select(Company.id).where(Company.name == "OpenAI"))
        assert openai is not None
        everyone = set(await session.scalars(select(Job.id)))
        scope_to(session, openai)
        own = set(await session.scalars(select(Job.id)))
        assert own and own < everyone
        changed = await session.execute(update(Job).values(department="Renamed"))
        assert changed.rowcount == len(own)
        removed = await session.execute(delete(Message))
        await session.commit()
    async with sessions() as session:
        renamed = set(await session.scalars(select(Job.id).where(Job.department == "Renamed")))
        assert renamed == own
        left = set(
            await session.scalars(select(Job.company_id).join(Application, Application.job_id == Job.id).join(Message))
        )
        assert left and openai not in left
    assert removed.rowcount > 0


async def test_each_employer_sees_only_the_phone_and_resume_it_was_given(
    client: AsyncClient, anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """One person record is shared by every employer someone applies to: what they gave one never shows at another."""
    from tests.test_careers import PRODUCT_DESIGNER, application

    email = "zed.okafor@inbox.dev"
    encord = application(first_name="Zed", last_name="Okafor", email=email, phone="+1 415 555 0100")
    assert (await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=encord)).status_code == 200
    sams = application(first_name="Zed", last_name="Okafor", email=email, availability=["friday"])
    sams["resume"] = {**sams["resume"], "file_name": "Zed for Sam's Cafe.docx"}
    kitchen = seed_id("job", SAMS_KITCHEN)
    assert (await anonymous.post(f"{API}/careers/jobs/{kitchen}/apply", json=sams)).status_code == 200

    async def seen_by(headers: dict[str, str]) -> dict[str, Any]:
        page = (await client.get(f"{API}/candidates", params={"search": "Zed", "limit": 50}, headers=headers)).json()
        [row] = page["items"]
        detail = (await client.get(f"{API}/candidates/{row['candidate']['id']}", headers=headers)).json()
        assert detail["candidate"] == row["candidate"]
        return row["candidate"]

    at_encord = await seen_by({})  # Alex
    at_sams = await seen_by(await link(sessions, SAM["email"]))
    assert at_encord["phone"] == "+1 415 555 0100"
    assert at_sams["phone"] is None
    # Each one's résumé link is its own, and opens for it.
    assert at_encord["resume_url"] != at_sams["resume_url"]
    for headers, person in (({}, at_encord), (await link(sessions, SAM["email"]), at_sams)):
        resume_id = person["resume_url"].rsplit("/", 1)[1]
        assert (await client.get(f"{API}/resumes/{resume_id}", headers=headers)).status_code == 200


async def test_only_the_company_ashby_is_connected_for_can_run_it(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """A self-made workspace's admin can't pull Ashby's data or send its invitations."""
    sam = await link(sessions, SAM["email"])
    for method, path in (("GET", "status"), ("POST", "sync?full=true")):
        refused = await client.request(method, f"{API}/integrations/ashby/{path}", headers=sam)
        assert refused.status_code == 404 and refused.json()["error"]["code"] == "ashby_not_connected"
    assert (await client.get(f"{API}/integrations/ashby/status")).status_code == 200  # Alex, at Encord


async def test_a_job_draft_is_written_for_the_recruiters_own_company(
    client: AsyncClient, julia: dict[str, str]
) -> None:
    answer = (
        await client.post(
            f"{API}/assistant/requests", json={"text": "Create a Research Engineer role in London"}, headers=julia
        )
    ).json()
    [card] = answer["cards"]
    assert card["type"] == "job_draft" and "OpenAI" in (card["draft"]["summary"] or "")
    assert leaked(card) == []


async def test_me_says_where_staff_work_and_how_it_hires(client: AsyncClient) -> None:
    me = (await client.get(f"{API}/me")).json()
    assert me["organization"] == "Encord"
    assert {key: me["workspace"][key] for key in ("name", "mode", "can_manage")} == {
        "name": "Encord",
        "mode": "full",
        "can_manage": False,
    }
    sophia = (await client.get(f"{API}/me", headers=bearer(SOPHIA_AUTH))).json()
    assert sophia["role"] == "candidate" and sophia["workspace"] is None


async def test_only_an_admin_changes_how_the_workspace_hires(
    client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    refused = await client.patch(f"{API}/workspace", json={"mode": "simple"})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "admins_only"

    async with sessions() as session:
        session.add(
            User(
                email="ada.admin@encord.example",
                full_name="Ada Admin",
                role=UserRole.ADMIN,
                company_id=seed_id("company", "encord"),
            )
        )
        await session.commit()
    ada = await link(sessions, "ada.admin@encord.example")
    changed = await client.patch(f"{API}/workspace", json={"mode": "simple", "location": "Leeds, UK"}, headers=ada)
    assert changed.status_code == 200
    assert (changed.json()["mode"], changed.json()["location"], changed.json()["can_manage"]) == (
        "simple",
        "Leeds, UK",
        True,
    )
    # Everyone in the workspace now gets Simple Hire; their data is just as it was.
    assert (await client.get(f"{API}/me")).json()["workspace"]["mode"] == "simple"
    assert (await client.get(f"{API}/candidates")).json()["total"] == 38
    back = await client.patch(f"{API}/workspace", json={"mode": "full"}, headers=ada)
    assert back.json()["mode"] == "full" and back.json()["location"] == "Leeds, UK"
