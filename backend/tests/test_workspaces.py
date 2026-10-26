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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import UserRole
from app.db.seed_data import OPENAI_RECRUITER
from app.main import app
from app.models import Job, User
from tests.conftest import API, application_id, candidate_id, job_id, link

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
