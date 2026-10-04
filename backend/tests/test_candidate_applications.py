"""A candidate with several applications: grouped by status, switchable, and never anyone else's."""

import json
import uuid

import pytest
from httpx import AsyncClient

from app.core.config import settings
from tests.ashby_support import FakeSupabaseAdmin, ago, application_event, deliver, fixture, iso
from tests.conftest import API, SOPHIA_EMAIL, application_id

SOPHIA_APP = application_id("sophia-martinez")
JAMES_APP = application_id("james-park")
REASON = "Internal: portfolio lacked systems depth"
JOBS: dict[str, str] = {}  # Ashby application id -> its Ashby job id

pytestmark = pytest.mark.usefixtures("ashby")


async def sophia_applies(anonymous: AsyncClient, title: str, **changes: object) -> str:
    """Sophia applies through Ashby to another job. Returns the Ashby application id."""
    external_id = str(uuid.uuid4())
    JOBS[external_id] = str(uuid.uuid4())
    payload = application_event(
        application_id=external_id,
        candidate_id="sophia-ashby-id",
        email=SOPHIA_EMAIL,
        name="Sophia Martinez",
        job_id=JOBS[external_id],
        job_title=title,
        **changes,  # type: ignore[arg-type]
    )
    response = await deliver(anonymous, payload)
    assert response.json().get("status") == "processed", response.text
    return external_id


async def portal_id(client: AsyncClient, title: str) -> str:
    applications = (await client.get(f"{API}/candidate/applications")).json()
    return next(item["id"] for item in applications if item["job_title"] == title)


@pytest.fixture
async def sophia_has_four(anonymous: AsyncClient, ashby: FakeSupabaseAdmin) -> None:
    """Product Designer (active, from the seed), plus three Ashby applications that ended differently."""
    senior = await sophia_applies(anonymous, "Senior Product Designer", updated_at=ago(hours=2))
    rejected = application_event(
        "candidateStageChange", application_id=senior, candidate_id="sophia-ashby-id", email=SOPHIA_EMAIL,
        name="Sophia Martinez", job_title="Senior Product Designer", stage="Archived", status="Archived",
        archive_reason_type="RejectedByOrg", archive_reason_text=REASON,
    )  # fmt: skip
    rejected["data"]["application"]["job"]["id"] = JOBS[senior]
    await deliver(anonymous, rejected)
    await sophia_applies(
        anonymous, "Design Systems Engineer", stage="Technical Interview", status="Archived",
        archive_reason_type="RejectedByCandidate",
    )  # fmt: skip
    closed_job = str(uuid.uuid4())
    payload = application_event(
        application_id=str(uuid.uuid4()), candidate_id="sophia-ashby-id", email=SOPHIA_EMAIL,
        name="Sophia Martinez", job_id=closed_job, job_title="Brand Designer", created_at=ago(days=40),
    )  # fmt: skip
    await deliver(anonymous, payload)
    job = fixture("jobUpdate")
    job["data"]["job"].update(id=closed_job, title="Brand Designer", status="Closed", updatedAt=iso(ago(seconds=1)))
    await deliver(anonymous, job)


@pytest.mark.usefixtures("sophia_has_four")
async def test_applications_are_grouped_by_status(client: AsyncClient) -> None:
    applications = (await client.get(f"{API}/candidate/applications")).json()
    summary = [(item["job_title"], item["status"], item["stage_label"]) for item in applications]
    assert summary[0] == ("Product Designer", "active", "Interview")
    assert ("Senior Product Designer", "no_longer_considered", "No longer under consideration") in summary
    assert ("Design Systems Engineer", "inactive", "Withdrawn") in summary
    assert ("Brand Designer", "inactive", "Role closed") in summary
    buckets = [item["status"] for item in applications]
    assert buckets == sorted(buckets, key=["active", "no_longer_considered", "inactive"].index)
    product = applications[0]
    assert product["next_interview_at"] is not None and product["company"] == "Encord"

    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["id"] == SOPHIA_APP  # opens on the active one
    assert len(me["applications"]) == 4


@pytest.mark.usefixtures("sophia_has_four")
async def test_switching_application_context(client: AsyncClient) -> None:
    rejected = await portal_id(client, "Senior Product Designer")
    me = (await client.get(f"{API}/candidate/me", params={"application_id": rejected})).json()
    assert me["application"]["id"] == rejected and me["job"]["title"] == "Senior Product Designer"
    assert me["application"]["status"] == "no_longer_considered"
    assert me["application"]["next_step"].startswith("This application is no longer under consideration.")
    assert all(step["state"] != "current" for step in me["application"]["steps"])
    assert me["next_interview"] is None

    detail = (await client.get(f"{API}/candidate/applications/{rejected}")).json()
    titles = [entry["title"] for entry in detail["timeline"]]
    assert titles[0] == "Application received" and "No longer under consideration" in titles
    assert REASON not in json.dumps(detail)

    withdrawn = await portal_id(client, "Design Systems Engineer")
    timeline = (await client.get(f"{API}/candidate/activity", params={"application_id": withdrawn})).json()
    assert timeline[0]["title"] == "Application withdrawn"
    steps = (await client.get(f"{API}/candidate/application", params={"application_id": withdrawn})).json()
    assert [step["state"] for step in steps["application"]["steps"]] == [
        "complete", "complete", "complete", "upcoming", "upcoming",
    ]  # fmt: skip

    # Interviews and messages follow the selected application.
    assert len((await client.get(f"{API}/candidate/interviews")).json()) == 2  # Product Designer's
    assert (await client.get(f"{API}/candidate/interviews", params={"application_id": rejected})).json() == []
    assert (await client.get(f"{API}/candidate/messages", params={"application_id": rejected})).json()["messages"] == []


@pytest.mark.usefixtures("sophia_has_four")
async def test_a_message_goes_to_the_selected_application(client: AsyncClient) -> None:
    withdrawn = await portal_id(client, "Design Systems Engineer")
    sent = await client.post(
        f"{API}/candidate/messages",
        json={"content": "Thanks for your time on this one.", "kind": "thank_you", "application_id": withdrawn},
    )
    assert sent.status_code == 201 and sent.json()["kind"] == "thank_you"
    thread = (await client.get(f"{API}/candidate/messages", params={"application_id": withdrawn})).json()
    assert [message["content"] for message in thread["messages"]] == ["Thanks for your time on this one."]
    assert "Thanks for your time" not in json.dumps((await client.get(f"{API}/candidate/messages")).json())
    # The recruiter sees it on that application's thread and timeline, labelled by the candidate.
    recruiter = (await client.get(f"{API}/applications/{withdrawn}/messages")).json()
    assert recruiter[-1]["kind"] == "thank_you"
    timeline = (await client.get(f"{API}/applications/{withdrawn}/activity")).json()
    assert timeline[0]["title"] == "Sent a thank-you note"


APPLICATION_ROUTES = [
    ("GET", "/candidate/me?application_id={id}", None),
    ("GET", "/candidate/applications/{id}", None),
    ("GET", "/candidate/application?application_id={id}", None),
    ("GET", "/candidate/activity?application_id={id}", None),
    ("GET", "/candidate/interviews?application_id={id}", None),
    ("GET", "/candidate/messages?application_id={id}", None),
    ("POST", "/candidate/messages", {"content": "Hello", "application_id": "{id}"}),
    ("POST", "/candidate/messages/read?application_id={id}", None),
    ("GET", "/candidate/prep?application_id={id}", None),
    ("POST", "/candidate/prep/viewed?application_id={id}", None),
    ("POST", "/candidate/ai/ask", {"message": "What's next?", "application_id": "{id}"}),
    ("POST", "/candidate/engagement/sessions", {"session_id": str(uuid.uuid4()), "application_id": "{id}"}),
    ("POST", "/candidate/engagement/heartbeat", {"session_id": str(uuid.uuid4()), "application_id": "{id}"}),
    ("POST", "/candidate/engagement/events", {"events": [{"type": "application_viewed", "application_id": "{id}"}]}),
]


@pytest.mark.parametrize(("method", "path", "body"), APPLICATION_ROUTES)
@pytest.mark.parametrize("target", [JAMES_APP, str(uuid.uuid4())], ids=["someone_elses", "unknown"])
async def test_another_application_id_reveals_nothing(
    client: AsyncClient, method: str, path: str, body: dict[str, object] | None, target: str
) -> None:
    url = API + path.replace("{id}", target)
    payload = json.loads(json.dumps(body).replace("{id}", target)) if body else None
    response = await client.request(method, url, json=payload)
    text = response.text
    if path.startswith("/candidate/me?"):
        # The home page falls back to her own default application rather than failing.
        assert response.status_code == 200 and response.json()["application"]["id"] == SOPHIA_APP
    else:
        assert response.status_code == 404, (method, path, text)
        assert response.json()["error"]["code"] == "application_not_found"
    assert "James" not in text and "ML Engineer" not in text


async def test_old_single_application_route_still_works(client: AsyncClient) -> None:
    detail = (await client.get(f"{API}/candidate/application")).json()
    assert detail["application"]["id"] == SOPHIA_APP


async def test_a_candidate_whose_only_application_closed_still_sees_it(
    anonymous: AsyncClient, client: AsyncClient
) -> None:
    moved = await client.patch(f"{API}/applications/{SOPHIA_APP}/stage", json={"stage": "rejected", "reason": REASON})
    assert moved.status_code == 200
    me = (await client.get(f"{API}/candidate/me")).json()
    assert me["application"]["id"] == SOPHIA_APP and me["application"]["status"] == "no_longer_considered"
    assert [item["status"] for item in me["applications"]] == ["no_longer_considered"]
    assert REASON not in json.dumps(me)
    assert settings.organization_name in me["application"]["next_step"]
