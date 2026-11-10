"""Real API checks for the public board, signed-in applications, and persisted posting sources."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.enums import JobStatus, JobVisibility, WorkArrangement
from app.models import Candidate, CandidateResume, Job
from app.models.base import utcnow
from tests.conftest import ALEX_AUTH, API, bearer, job_id, link
from tests.test_careers import application


async def test_search_filters_counts_pagination_and_sources(client, anonymous, sessions):
    sam = await link(sessions, "sam@samscafe.example")
    common = {"status": "open", "location": "Boardville", "description": "Distinctive testing role"}
    recruiter = (await client.post(f"{API}/jobs", json={
        **common, "title": "Board Engineer", "work_arrangement": "remote", "employment_type": "Full_Time",
        "salary_min": 90000, "salary_max": 120000, "posted_by": "small_business",
    })).json()
    small = (await anonymous.post(f"{API}/jobs", headers=sam, json={
        **common, "title": "Board Barista", "work_arrangement": "onsite", "employment_type": "Part-time",
        "salary_min": 20, "salary_max": 25, "salary_period": "hour", "posted_by": "recruiter",
    })).json()
    assert recruiter["posted_by"] == "recruiter" and small["posted_by"] == "small_business"
    assert recruiter["salary_currency"] == "USD" and recruiter["salary_period"] == "year"
    assert recruiter["published_at"] and small["published_at"]
    query = {"location": "boardVILLE"}

    async def search(**filters):
        response = await anonymous.get(f"{API}/careers/search", params={**query, **filters})
        assert response.status_code == 200, response.text
        return response.json()

    page = await search()
    assert page["counts"] == {"all": 2, "recruiter": 1, "small_business": 1}
    assert [row["id"] for row in page["items"]] == [small["id"], recruiter["id"]]
    assert (await search(source="small_business"))["total"] == 1
    assert (await search(source="small_business"))["counts"] == page["counts"]
    for filters in ({"q": "engineer encord"}, {"arrangement": "remote"}, {"type": "full_time"}, {"salary": "80000"}):
        assert [row["id"] for row in (await search(**filters))["items"]] == [recruiter["id"]]
    assert (await search(salary="50000"))["total"] == 2  # hourly rates annualise
    assert (await search(salary="listed", posted_within=1))["total"] == 2
    assert (await search(q="%"))["total"] == 0  # literal wildcards
    assert (await search(limit=1, offset=1))["items"][0]["id"] == recruiter["id"]
    assert (await search(offset=99))["items"] == []
    # The source is the account at posting time, not the current UI mode or a client-provided field.
    changed = await anonymous.patch(f"{API}/workspace", headers=sam, json={"mode": "full"})
    assert changed.status_code == 200, changed.text
    assert (await anonymous.get(f"{API}/careers/jobs/{small['id']}")).json()["source"] == "small_business"
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(recruiter["id"]))
        job.published_at = utcnow() - timedelta(days=31)
        await session.commit()
    assert (await search(posted_within=30))["total"] == 1
    await client.patch(f"{API}/jobs/{recruiter['id']}", json={"salary_currency": "EUR"})
    assert (await search(salary="80000"))["total"] == 0  # dollar filters never compare euro amounts as dollars
    assert (await search(salary="listed"))["total"] == 2


@pytest.mark.parametrize("params", [
    {"arrangement": "moon"}, {"type": "other"}, {"source": "admin"}, {"posted_within": 2},
    {"salary": "-1"}, {"salary": "1000000000000"}, {"limit": 51}, {"offset": -1}, {"q": "a" * 101},
])
async def test_invalid_filters_are_refused(anonymous, params):
    assert (await anonymous.get(f"{API}/careers/search", params=params)).status_code == 422


@pytest.mark.parametrize("hidden,code", [
    ({"status": JobStatus.DRAFT}, 404), ({"status": JobStatus.CLOSED}, 409),
    ({"visibility": JobVisibility.PRIVATE}, 404), ({"expires_at": "past"}, 409),
    ({"external_id": "external-board-test"}, 404),
])
async def test_unpublished_jobs_are_hidden_from_all_reads_and_both_apply_paths(anonymous, client, sessions, hidden, code):
    id = job_id("Product Designer")
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(id))
        for field, value in hidden.items():
            setattr(job, field, utcnow() - timedelta(seconds=1) if value == "past" else value)
        await session.commit()
    assert (await anonymous.get(f"{API}/careers/jobs/{id}")).status_code == 404
    assert id not in {row["id"] for row in (await anonymous.get(f"{API}/careers/jobs")).json()}
    assert id not in {row["id"] for row in (await anonymous.get(f"{API}/careers/search")).json()["items"]}
    assert (await anonymous.post(f"{API}/careers/jobs/{id}/apply", json=application())).status_code == code
    assert (await client.post(f"{API}/candidate/jobs/{id}/apply", json=application())).status_code == code


async def test_signed_in_application_uses_account_identity_and_reaches_only_its_employer(client, anonymous, sessions):
    sam = await link(sessions, "sam@samscafe.example")
    role = (await anonymous.post(f"{API}/jobs", headers=sam, json={
        "title": "Board Cook", "work_days": ["friday"], "status": "open",
    })).json()
    path = f"{API}/candidate/jobs/{role['id']}/apply"
    answers = application(phone="+1 503 555 0101", availability=["friday"], experience_note="Kitchen experience")
    # Name and email in this request are Ana's; only Sophia's verified identity is used.
    assert (await anonymous.post(path, json=answers)).status_code == 401
    assert (await anonymous.post(path, headers=bearer(ALEX_AUTH), json=answers)).status_code == 403
    assert (await client.post(path, json={**answers, "availability": []})).status_code == 422
    applied = await client.post(path, json=answers)
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["status"] == "submitted" and result["company"] == "Sam's Cafe"
    again = (await client.post(path, json=answers)).json()
    assert again["status"] == "already_applied" and again["application_id"] == result["application_id"]
    mine = (await client.get(f"{API}/candidate/applications")).json()
    assert any(row["id"] == result["application_id"] for row in mine)
    candidates = (await anonymous.get(f"{API}/candidates", headers=sam, params={"search": "sophia.martinez@example.com"})).json()["items"]
    [item] = [row for row in candidates if row["application_id"] == result["application_id"]]
    assert item["candidate"]["email"] == "sophia.martinez@example.com"
    assert (await client.get(f"{API}/applications/{result['application_id']}/activity")).status_code == 404
    async with sessions() as session:
        assert await session.scalar(select(Candidate).where(Candidate.email == answers["email"])) is None
        resumes = (await session.scalars(select(CandidateResume).where(CandidateResume.application_id == uuid.UUID(result["application_id"])))).all()
        assert len(resumes) == 1


async def test_job_salary_validation_partial_updates_and_first_publication(client):
    created = await client.post(f"{API}/jobs", json={"title": "Salary role", "status": "draft", "salary_min": 50000, "salary_max": 80000})
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["published_at"] is None
    path = f"{API}/jobs/{job['id']}"
    assert (await client.patch(path, json={"salary_min": 90000})).status_code == 422
    published = (await client.patch(path, json={"status": "open", "work_arrangement": "hybrid"})).json()
    assert published["published_at"] and published["work_arrangement"] == WorkArrangement.HYBRID
    await client.patch(path, json={"status": "closed"})
    assert (await client.patch(path, json={"status": "open"})).json()["published_at"] == published["published_at"]
    for bad in ({"salary_min": -1}, {"salary_min": 5, "salary_max": 1}, {"salary_currency": "US"}, {"expires_at": (utcnow() - timedelta(days=1)).isoformat()}):
        assert (await client.post(f"{API}/jobs", json={"title": "Bad role", **bad})).status_code == 422


async def test_blank_filters_mean_no_filter(anonymous):
    """A cleared field or a hand-edited URL (?salary=&posted_within=) lists everything instead of refusing."""
    everything = (await anonymous.get(f"{API}/careers/search")).json()
    blank = await anonymous.get(f"{API}/careers/search", params={"q": " ", "location": "", "salary": "", "posted_within": "", "source": ""})
    assert blank.status_code == 200, blank.text
    assert blank.json()["total"] == everything["total"] > 0


async def test_editing_an_open_job_never_makes_it_new_on_the_board(client, sessions):
    """Only opening a job publishes it: an edit to an open job without a publication time (made by an older release) leaves
    it at its created time, rather than jumping to the top of "newest" and "Past 24 hours"."""
    job = (await client.post(f"{API}/jobs", json={"title": "Long-open role", "status": "open"})).json()
    async with sessions() as session:
        row = await session.get(Job, uuid.UUID(job["id"]))
        row.published_at = None
        await session.commit()
    edited = (await client.patch(f"{API}/jobs/{job['id']}", json={"title": "Long-open role, renamed"})).json()
    assert edited["published_at"] is None
