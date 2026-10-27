"""TalentBridge's own careers site: open jobs, and applying with a name, an email and a résumé. The
application exists straight away, and the applicant's portal link comes by email."""

import base64
import io
import uuid
import zipfile
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.enums import JobStatus
from app.integrations.supabase_admin import get_supabase_admin
from app.main import app
from app.models import Application, Candidate, CandidateResume, Job
from app.services.demo_resumes import DOCX, Resume
from app.services.resumes import read_text
from tests.ashby_support import FakeSupabaseAdmin
from tests.conftest import API, SOPHIA_AUTH, FakeEmail, bearer, job_id, use_email

PRODUCT_DESIGNER = job_id("Product Designer")
EMAIL = "ana.lima@inbox.dev"
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


def docx(text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        body = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.split("\n"))
        archive.writestr(
            "word/document.xml",
            f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>',
        )
    return buffer.getvalue()


RESUME_TEXT = "Ana Lima\nProduct designer, 6 years\nDesign systems at Nubank\nFigma, prototyping, user research"


def application(**changes: Any) -> dict[str, Any]:
    content = docx(RESUME_TEXT)
    return {
        "first_name": "Ana",
        "last_name": "Lima",
        "email": EMAIL,
        "resume": {"file_name": "Ana Lima CV.docx", "content_type": "", "data": base64.b64encode(content).decode()},
        **changes,
    }


@pytest.fixture
def supabase(anonymous: AsyncClient) -> FakeSupabaseAdmin:
    admin = FakeSupabaseAdmin()
    app.dependency_overrides[get_supabase_admin] = lambda: admin
    return admin


async def test_the_careers_site_lists_open_jobs_made_in_talentbridge(anonymous: AsyncClient) -> None:
    jobs = (await anonymous.get(f"{API}/careers/jobs")).json()
    assert jobs and all(job["id"] for job in jobs)
    titles = {job["title"] for job in jobs}
    assert "Product Designer" in titles
    detail = (await anonymous.get(f"{API}/careers/jobs/{PRODUCT_DESIGNER}")).json()
    assert detail["title"] == "Product Designer" and detail["summary"]
    assert (await anonymous.get(f"{API}/careers/jobs/{uuid.uuid4()}")).status_code == 404


async def test_closed_and_draft_jobs_take_no_applications(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], supabase: FakeSupabaseAdmin
) -> None:
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(PRODUCT_DESIGNER))
        assert job is not None
        job.status = JobStatus.CLOSED
        await session.commit()
    closed = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "job_closed"
    listed = {job["id"] for job in (await anonymous.get(f"{API}/careers/jobs")).json()}
    assert PRODUCT_DESIGNER not in listed


async def test_applying_creates_the_application_at_once_and_emails_the_portal_link(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession], supabase: FakeSupabaseAdmin
) -> None:
    applied = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    assert applied.status_code == 200, applied.text
    assert applied.json() == {
        "status": "submitted",
        "portal_link": "invitation_sent",
        "email": EMAIL,
        "job_title": "Product Designer",
        "company": "Encord",
        "confirmation_emailed": False,  # no email provider: Supabase's own invitation email went
    }
    [invite] = supabase.invites
    assert invite["email"] == EMAIL and invite["redirect_to"].endswith("/auth/callback?next=/welcome")
    assert invite["emailed_by"] == "supabase"

    # The recruiter sees it straight away, with the résumé.
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert (item["stage"], item["source"], item["candidate"]["portal_status"]) == ("sourced", "Careers site", "invited")
    resume_url = item["candidate"]["resume_url"]
    assert resume_url.startswith(f"{API}/resumes/")
    resume = await client.get(resume_url)
    assert resume.status_code == 200 and resume.headers["content-type"] == DOCX
    assert resume.headers["cache-control"] == "private, no-store"
    assert (await anonymous.get(resume_url)).status_code == 401
    timeline = (await client.get(f"{API}/applications/{item['application_id']}/activity")).json()
    assert [entry["title"] for entry in timeline] == ["Candidate portal invitation sent", "Applied on the careers site"]

    # Today: a new applicant is on track until the "no update" rule's time is up.
    assert item["communication"]["status"] == "on_track"

    async with sessions() as session:
        stored = await session.scalar(select(CandidateResume))
    assert stored is not None and "Design systems at Nubank" in (stored.text or "")


async def test_applying_again_adds_nothing_and_sends_a_sign_in_link(
    anonymous: AsyncClient, sessions: async_sessionmaker[AsyncSession], supabase: FakeSupabaseAdmin
) -> None:
    await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    again = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    assert again.json()["status"] == "already_applied"
    assert again.json()["portal_link"] == "sign_in_link_sent"  # the account exists now
    assert [link["email"] for link in supabase.sign_in_links] == [EMAIL]
    assert supabase.sign_in_links[0]["redirect_to"].endswith("/auth/callback?next=/candidate")
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(Candidate).where(Candidate.email == EMAIL)) == 1
        candidate_id = await session.scalar(select(Candidate.id).where(Candidate.email == EMAIL))
        assert (
            await session.scalar(
                select(func.count()).select_from(Application).where(Application.candidate_id == candidate_id)
            )
            == 1
        )
    assert len(supabase.invites) == 1

    # A second role is a second application, and an existing account gets a sign-in link, not a new invite.
    other = job_id("ML Engineer")
    second = await anonymous.post(f"{API}/careers/jobs/{other}/apply", json=application(email=EMAIL.upper()))
    assert second.json()["status"] == "submitted" and second.json()["portal_link"] == "sign_in_link_sent"
    assert len(supabase.invites) == 1


async def test_without_supabase_the_application_still_goes_through(anonymous: AsyncClient, client: AsyncClient) -> None:
    applied = (await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())).json()
    assert (applied["status"], applied["portal_link"]) == ("submitted", "unavailable")
    items = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert len(items) == 1


async def test_the_application_is_checked(anonymous: AsyncClient, supabase: FakeSupabaseAdmin) -> None:
    not_a_resume = application(
        resume={"file_name": "cv.txt", "content_type": "text/plain", "data": base64.b64encode(b"hi").decode()}
    )
    refused = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=not_a_resume)
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "invalid_resume"
    for bad in ({"email": "not-an-email"}, {"first_name": ""}, {"phone": "call me"}):
        assert (
            await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application(**bad))
        ).status_code == 422
    staff = await anonymous.post(
        f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application(email="alex.chen@encord.example")
    )
    assert staff.status_code == 422 and staff.json()["error"]["code"] == "email_not_accepted"
    assert supabase.invites == []


async def test_the_new_candidate_signs_in_and_sees_their_application(
    anonymous: AsyncClient, supabase: FakeSupabaseAdmin
) -> None:
    await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    token = bearer(supabase.users[EMAIL], email=EMAIL)
    me = (await anonymous.get(f"{API}/candidate/me", headers=token)).json()
    assert me["job"]["title"] == "Product Designer"
    assert [(item["job_title"], item["stage_label"]) for item in me["applications"]] == [
        ("Product Designer", "Applied")
    ]


def test_resume_text_is_read_from_docx_and_pdf_never_fails() -> None:
    assert "Design systems at Nubank" in (read_text(Resume(docx(RESUME_TEXT), DOCX, "cv.docx")) or "")
    assert read_text(Resume(PDF, "application/pdf", "cv.pdf")) is None  # no text in it
    assert read_text(Resume(b"PK\x03\x04garbage", DOCX, "cv.docx")) is None  # damaged: no text, no error


async def test_an_application_keeps_what_the_applicant_gave_for_it(
    anonymous: AsyncClient, client: AsyncClient, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """The phone number, LinkedIn profile, days and experience are this application's: the recruiter sees
    them with it."""
    async with sessions() as session:
        job = await session.get(Job, uuid.UUID(PRODUCT_DESIGNER))
        assert job is not None
        job.work_days = ["friday", "saturday", "sunday"]
        await session.commit()

    def apply(**changes: Any) -> Any:
        return anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application(**changes))

    missing = await apply()
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "availability_required"
    other_day = await apply(availability=["monday"])
    assert (
        other_day.status_code == 422 and other_day.json()["error"]["message"] == "Choose from the days this job needs."
    )
    for bad in ({"linkedin_url": "https://example.com/ana"}, {"availability": ["someday"]}):
        assert (await apply(**{"availability": ["friday"], **bad})).status_code == 422

    applied = await apply(
        phone="+1 503 555 0142",
        linkedin_url="linkedin.com/in/ana-lima",
        availability=["saturday", "friday", "saturday"],
        experience_note="  Two years as a barista, and weekend shifts at a bakery.  ",
    )
    assert applied.status_code == 200, applied.text
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    detail = (await client.get(f"{API}/candidates/{item['candidate']['id']}")).json()
    assert {
        key: detail["application"][key] for key in ("phone", "linkedin_url", "availability", "experience_note")
    } == {
        "phone": "+1 503 555 0142",
        "linkedin_url": "https://linkedin.com/in/ana-lima",
        "availability": ["friday", "saturday"],
        "experience_note": "Two years as a barista, and weekend shifts at a bakery.",
    }
    listed = (await anonymous.get(f"{API}/careers/jobs/{PRODUCT_DESIGNER}")).json()
    assert listed["work_days"] == ["friday", "saturday", "sunday"]


async def test_a_job_without_work_days_asks_for_none(anonymous: AsyncClient, client: AsyncClient) -> None:
    applied = await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())
    assert applied.status_code == 200
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    detail = (await client.get(f"{API}/candidates/{item['candidate']['id']}")).json()
    assert (detail["application"]["availability"], detail["application"]["phone"]) == ([], None)


# With an email provider: one email from TalentBridge confirms the application and carries the link.


async def test_a_new_applicant_gets_one_email_to_create_their_password(
    anonymous: AsyncClient, client: AsyncClient, supabase: FakeSupabaseAdmin
) -> None:
    mail = use_email(FakeEmail())
    applied = (await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())).json()
    assert (applied["portal_link"], applied["confirmation_emailed"]) == ("invitation_sent", True)
    [invite] = supabase.invites
    assert invite["emailed_by"] == "talentbridge"  # Supabase made the account; it sent nothing
    [sent] = mail.sent
    assert (sent.to, sent.subject) == (EMAIL, "Application received: Product Designer at Encord")
    assert "Your application for Product Designer at Encord has been submitted." in sent.text
    assert "Create your TalentBridge password to follow updates from the hiring team:" in sent.text
    assert "type=invite&token=invite-1" in sent.text
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    timeline = (await client.get(f"{API}/applications/{item['application_id']}/activity")).json()
    assert timeline[0]["title"] == "Candidate portal invitation sent"

    # Applying to another role: the same account, so a sign-in link this time.
    again = (await anonymous.post(f"{API}/careers/jobs/{job_id('ML Engineer')}/apply", json=application())).json()
    assert (again["status"], again["portal_link"], again["confirmation_emailed"]) == (
        "submitted",
        "sign_in_link_sent",
        True,
    )
    assert len(supabase.invites) == 1 and len(mail.sent) == 2
    assert "Sign in to TalentBridge to follow updates from the hiring team:" in mail.sent[1].text
    assert mail.sent[0].idempotency_key != mail.sent[1].idempotency_key


async def test_if_the_email_fails_the_application_still_stands(
    anonymous: AsyncClient, client: AsyncClient, supabase: FakeSupabaseAdmin
) -> None:
    use_email(FakeEmail(fail="The email service refused the email (403): domain not verified"))
    applied = (await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application())).json()
    assert (applied["status"], applied["portal_link"], applied["confirmation_emailed"]) == (
        "submitted",
        "unavailable",
        False,
    )
    [item] = (await client.get(f"{API}/candidates", params={"search": EMAIL})).json()["items"]
    assert item["candidate"]["portal_status"] == "invited"  # the account is theirs: "Forgot password" works


async def test_someone_with_an_account_applies_elsewhere_and_it_joins_their_portal(
    anonymous: AsyncClient, client: AsyncClient, supabase: FakeSupabaseAdmin, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """Sophia already has a TalentBridge account. Applying to another company with the same email adds an
    application to it: no second account, no second candidate."""
    mail = use_email(FakeEmail())
    jobs = (await anonymous.get(f"{API}/careers/jobs")).json()
    other = next(job for job in jobs if job["company"] not in ("Encord", "Sam's Cafe"))
    sophia = application(first_name="Sophia", last_name="Martinez", email="Sophia.Martinez@example.com")
    applied = (await anonymous.post(f"{API}/careers/jobs/{other['id']}/apply", json=sophia)).json()
    assert (applied["status"], applied["portal_link"]) == ("submitted", "sign_in_link_sent")
    assert supabase.invites == [] and "Sign in to TalentBridge" in mail.sent[0].text
    async with sessions() as session:
        people = await session.scalar(
            select(func.count()).select_from(Candidate).where(Candidate.email == "sophia.martinez@example.com")
        )
    assert people == 1
    mine = (await client.get(f"{API}/candidate/applications", headers=bearer(SOPHIA_AUTH))).json()
    assert (other["title"], other["company"]) in {(item["job_title"], item["company"]) for item in mine}


async def test_one_address_applying_too_often_is_asked_to_wait(anonymous: AsyncClient) -> None:
    from app.services import careers

    for index in range(careers.APPLY_LIMIT):
        body = application(email=f"applicant{index}@inbox.dev")
        assert (await anonymous.post(f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=body)).status_code == 200
    refused = await anonymous.post(
        f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply", json=application(email="late@inbox.dev")
    )
    assert refused.status_code == 429 and refused.json()["error"]["code"] == "too_many_applications"
    other = await anonymous.post(
        f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply",
        json=application(email="someone.else@inbox.dev"),
        headers={"X-Forwarded-For": "198.51.100.7"},
    )
    assert other.status_code == 200


async def test_the_limit_counts_the_address_our_proxy_saw(anonymous: AsyncClient) -> None:
    """Behind the proxy, X-Forwarded-For ends with the visitor's real address: what comes before it is theirs to
    make up, and changing it doesn't reset the count."""
    from app.services import careers

    for index in range(careers.APPLY_LIMIT + 1):
        response = await anonymous.post(
            f"{API}/careers/jobs/{PRODUCT_DESIGNER}/apply",
            json=application(email=f"spoof{index}@inbox.dev"),
            headers={"X-Forwarded-For": f"10.0.0.{index}, 198.51.100.20"},
        )
    assert response.status_code == 429
