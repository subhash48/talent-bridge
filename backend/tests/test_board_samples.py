"""The job board's sample employers (app/db/board_samples.py): what they add, the Simple Hire test owner, and hiding."""

import uuid
from collections import Counter

from sqlalchemy import select

from app.core.enums import UserRole
from app.db import board_samples
from app.models import User
from app.services.account_service import AuthAccount
from tests.conftest import ALEX_EMAIL, API, bearer

OWNER = "owner.bluebird@inbox.example"
OWNER_AUTH = uuid.UUID("b1eb1bd0-0000-4000-8000-000000000001")


async def board(anonymous, **params):
    response = await anonymous.get(f"{API}/careers/search", params={"limit": 50, **params})
    assert response.status_code == 200, response.text
    return response.json()


async def test_samples_add_five_recruiter_and_five_small_business_jobs_once(sessions, anonymous):
    before = await board(anonymous)
    async with sessions() as session:
        assert await board_samples.add_samples(session) == {"companies": 10, "jobs": 10}
        assert await board_samples.add_samples(session) == {"companies": 0, "jobs": 0}  # a second run adds nothing
    after = await board(anonymous)
    assert after["counts"]["recruiter"] == before["counts"]["recruiter"] + 5
    assert after["counts"]["small_business"] == before["counts"]["small_business"] + 5
    sample_names = {company.name for company in board_samples.COMPANIES}
    samples = [job for job in after["items"] if job["company"] in sample_names]
    assert len(samples) == 10
    # One job per company: five companies on each tab.
    assert Counter(job["source"] for job in samples) == {"recruiter": 5, "small_business": 5}
    assert len({job["company"] for job in samples}) == 10
    for job in samples:
        assert job["salary_min"] and job["salary_max"] and job["salary_currency"] == "USD" and job["work_arrangement"]
    small = next(job for job in samples if job["company"] == "Bluebird Coffee Co.")
    assert small["pay"] == "$16–$19/hour" and small["salary_period"] == "hour" and small["work_arrangement"] == "On-site"
    detail = await anonymous.get(f"{API}/careers/jobs/{small['id']}")
    assert detail.status_code == 200 and detail.json()["source"] == "small_business"


async def test_owner_signs_in_to_their_own_simple_hire_workspace_only(sessions, anonymous, monkeypatch):
    async def account(session, *, auth_user_id=None, email=None):
        return AuthAccount(id=OWNER_AUTH, email=OWNER, email_verified=True) if email == OWNER else None

    monkeypatch.setattr(board_samples, "find_auth_account", account)
    async with sessions() as session:
        await board_samples.add_samples(session)
        message = await board_samples.add_owner(session, OWNER, "Jordan Lee")
        assert "signs in" in message
        assert "signs in" in await board_samples.add_owner(session, OWNER, "Jordan Lee")  # again: no change, no error
    owner = bearer(OWNER_AUTH)
    me = (await anonymous.get(f"{API}/me", headers=owner)).json()
    assert me["role"] == "admin" and me["workspace"]["mode"] == "simple"
    jobs = await anonymous.get(f"{API}/jobs", headers=owner)
    assert jobs.status_code == 200, jobs.text
    assert [job["title"] for job in jobs.json()] == ["Barista"]  # Bluebird's own job, nobody else's


async def test_owner_never_takes_over_an_existing_person(sessions, monkeypatch):
    async def nobody(*args, **kwargs):
        return None

    monkeypatch.setattr(board_samples, "find_auth_account", nobody)
    async with sessions() as session:
        await board_samples.add_samples(session)
        assert "left unchanged" in await board_samples.add_owner(session, ALEX_EMAIL, "Alex Chen")
        alex = await session.scalar(select(User).where(User.email == ALEX_EMAIL))
        assert alex.role == UserRole.RECRUITER and alex.company_id != board_samples.seed_id("company", "bluebird-coffee")
        assert "no Supabase account" in await board_samples.add_owner(session, "later@inbox.example", "Later Owner")


async def test_hide_takes_the_samples_off_the_board(sessions, anonymous):
    before = await board(anonymous)
    async with sessions() as session:
        await board_samples.add_samples(session)
        assert await board_samples.hide_samples(session) == 10
        assert await board_samples.hide_samples(session) == 0
    assert (await board(anonymous))["counts"] == before["counts"]
