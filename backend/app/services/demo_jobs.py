"""Development-only demo jobs: a recruiter writes a posting, with the AI job writer's help if they like,
saves it as a draft and publishes it to the demo careers site (/demo/careers).

A demo job is an ordinary jobs row with a tb-demo- Ashby id, so the Ashby simulator, its reset and every
recruiter page treat it like simulator data, plus a demo_job_postings row with what the careers site
shows. jobs.description is rendered from the posting on every save: the Jobs board shows its first
paragraph, and the AI analysis reads its "Skills:" line (services/ai/context.parse_requirements).

The posting's status is the careers site's; jobs.status stays the ATS's. Publishing opens the job and
closing closes it, but unpublishing only takes the posting off the site: whoever already applied keeps
an open application.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DemoApplicationStatus, DemoPostingStatus, JobStatus
from app.core.errors import AppError, BadRequestError, ConflictError, NotFoundError
from app.integrations.ashby.demo_ids import demo_id
from app.models import Application, DemoApplication, DemoJobPosting, Job, User
from app.models.base import utcnow
from app.schemas.demo import DemoJobCreate, DemoJobRead, DemoJobUpdate, GeneratedJobPosting, JobPostingBrief
from app.services.ai.client import AIProvider
from app.services.ai.job_posting_policy import apply_policy
from app.services.ai_service import with_fallback
from app.services.demo_careers import PENDING_TTL

# The fields of DemoJobCreate and DemoJobUpdate that live on the job; the rest belong to the posting.
JOB_FIELDS = frozenset({"title", "department", "location", "employment_type"})
PENDING = (DemoApplicationStatus.AWAITING_ACTIVATION, DemoApplicationStatus.AWAITING_SIGN_IN)

# What the careers site needs before it can show a posting, in the order the editor shows the fields:
# (field, what the message asks for, the field's own message).
REQUIRED = (
    ("title", "a job title", "Add a job title."),
    ("summary", "a summary", "Add a summary."),
    ("about_role", "a description of the role", "Describe the role."),
    ("responsibilities", "at least one responsibility", "Add at least one responsibility."),
    ("requirements", "at least one requirement", "Add at least one requirement."),
)


class PostingIncompleteError(AppError):
    """The posting is missing something the careers site needs. details lists each missing field."""

    status_code = 422
    code = "posting_incomplete"


async def list_demo_jobs(session: AsyncSession) -> list[DemoJobRead]:
    """Newest first."""
    postings = (await session.scalars(select(DemoJobPosting).order_by(DemoJobPosting.created_at.desc()))).all()
    return await _reads(session, postings)


async def get_demo_job(session: AsyncSession, job_id: uuid.UUID) -> DemoJobRead:
    return await _read(session, await _posting(session, job_id))


async def create_demo_job(session: AsyncSession, data: DemoJobCreate, actor: User) -> DemoJobRead:
    """A new demo job, always a draft: off the careers site, and a draft job in the ATS."""
    values = data.model_dump()
    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        external_id=demo_id("job", str(job_id)),
        status=JobStatus.DRAFT,
        **{field: values.pop(field) for field in JOB_FIELDS},
    )
    posting = DemoJobPosting(job=job, status=DemoPostingStatus.DRAFT, created_by=actor.id, **values)
    job.description = render_description(posting)
    session.add_all([job, posting])
    await session.commit()
    return await _read(session, posting)


async def update_demo_job(session: AsyncSession, job_id: uuid.UUID, data: DemoJobUpdate) -> DemoJobRead:
    """Only the fields sent are changed. A published posting has to stay publishable, so the careers
    site never shows a broken one."""
    posting = await _posting(session, job_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(posting.job if field in JOB_FIELDS else posting, field, value)
    if posting.salary_min is not None and posting.salary_max is not None and posting.salary_min > posting.salary_max:
        raise BadRequestError("The minimum salary can't be more than the maximum.", code="invalid_salary_range")
    if posting.status == DemoPostingStatus.PUBLISHED:
        check_publishable(posting)
    if changes:
        posting.job.description = render_description(posting)
        posting.updated_at = utcnow()
    await session.commit()
    return await _read(session, posting)


async def publish(session: AsyncSession, job_id: uuid.UUID) -> DemoJobRead:
    """List the posting on the careers site and open the job. Publishing again changes nothing."""
    posting = await _posting(session, job_id, for_update=True)
    check_publishable(posting)
    if posting.status != DemoPostingStatus.PUBLISHED:
        now = utcnow()
        posting.status = DemoPostingStatus.PUBLISHED
        posting.published_at = now
        posting.closed_at = None
        posting.updated_at = now
    posting.job.status = JobStatus.OPEN
    await session.commit()
    return await _read(session, posting)


async def unpublish(session: AsyncSession, job_id: uuid.UUID) -> DemoJobRead:
    """Take the posting off the careers site. The job stays open, so whoever already applied keeps an
    active application. A draft stays a draft; a closed job has to be published to reopen."""
    posting = await _posting(session, job_id, for_update=True)
    if posting.status == DemoPostingStatus.CLOSED:
        raise ConflictError("This demo job is closed. Publish it to reopen it.", code="posting_closed")
    if posting.status == DemoPostingStatus.PUBLISHED:
        posting.status = DemoPostingStatus.DRAFT
        posting.updated_at = utcnow()
    await session.commit()
    return await _read(session, posting)


async def close(session: AsyncSession, job_id: uuid.UUID) -> DemoJobRead:
    """Close the job: off the careers site, no new applications, and closed in the ATS, so the candidate
    portal shows its applications as "Role closed". Nothing is deleted. Closing again changes nothing."""
    posting = await _posting(session, job_id, for_update=True)
    if posting.status != DemoPostingStatus.CLOSED:
        now = utcnow()
        posting.status = DemoPostingStatus.CLOSED
        posting.closed_at = now
        posting.updated_at = now
    posting.job.status = JobStatus.CLOSED
    await session.commit()
    return await _read(session, posting)


async def write_posting(brief: JobPostingBrief, provider: AIProvider) -> GeneratedJobPosting:
    """A draft from the AI job writer for the recruiter to review and edit. Nothing is saved or published,
    and the posting policy leaves out anything that refers to a personal characteristic."""
    content, model_name = await with_fallback(
        provider,
        lambda p: p.write_job_posting(brief, settings.organization_name, settings.organization_overview),
    )
    content, removed = apply_policy(content)
    return GeneratedJobPosting(draft=content, model_name=model_name, removed=removed)


def check_publishable(posting: DemoJobPosting) -> None:
    values = {
        "title": posting.job.title,
        "summary": posting.summary,
        "about_role": posting.about_role,
        "responsibilities": posting.responsibilities,
        "requirements": posting.requirements,
    }
    missing = [(field, ask, message) for field, ask, message in REQUIRED if not values[field]]
    if missing:
        asks = [ask for _, ask, _ in missing]
        listed = asks[0] if len(asks) == 1 else f"{', '.join(asks[:-1])} and {asks[-1]}"
        raise PostingIncompleteError(
            f"Add {listed} before publishing.",
            details=[{"field": field, "message": message} for field, _, message in missing],
        )


def render_description(posting: DemoJobPosting) -> str | None:
    """jobs.description: the posting as plain text, empty sections left out. The summary comes first and
    the skills last, as the "Skills: a, b" line the AI analysis reads requirements from."""
    sections = [
        posting.summary,
        f"About the role\n{posting.about_role}" if posting.about_role else None,
        _bullets("Responsibilities", posting.responsibilities),
        _bullets("Requirements", posting.requirements),
        _bullets("Preferred qualifications", posting.preferred_qualifications),
        f"About the team\n{posting.about_team}" if posting.about_team else None,
        f"Skills: {', '.join(posting.skills)}" if posting.skills else None,
    ]
    return "\n\n".join(section for section in sections if section) or None


def _bullets(heading: str, items: list[str]) -> str | None:
    return "\n".join([heading, *(f"- {item}" for item in items)]) if items else None


async def _posting(session: AsyncSession, job_id: uuid.UUID, *, for_update: bool = False) -> DemoJobPosting:
    """The demo job's posting, with its job. A job without a posting isn't a demo job."""
    query = select(DemoJobPosting).where(DemoJobPosting.job_id == job_id)
    if for_update:
        query = query.with_for_update(of=DemoJobPosting)  # serialises concurrent changes to one demo job
    posting = await session.scalar(query)
    if posting is None:
        raise NotFoundError("Demo job not found.", code="demo_job_not_found")
    return posting


async def _reads(session: AsyncSession, postings: Sequence[DemoJobPosting]) -> list[DemoJobRead]:
    """Two count queries for any number of demo jobs."""
    ids = [posting.job_id for posting in postings]
    if not ids:
        return []
    # Every application, at any stage and archived ones too: the job's whole pipeline.
    applicants = dict(
        (
            await session.execute(
                select(Application.job_id, func.count()).where(Application.job_id.in_(ids)).group_by(Application.job_id)
            )
        ).all()
    )
    # Only those signing in can still submit: one left longer than PENDING_TTL needs applying again.
    pending = dict(
        (
            await session.execute(
                select(DemoApplication.job_id, func.count())
                .where(
                    DemoApplication.job_id.in_(ids),
                    DemoApplication.status.in_(PENDING),
                    DemoApplication.updated_at > utcnow() - PENDING_TTL,
                )
                .group_by(DemoApplication.job_id)
            )
        ).all()
    )
    return [
        _demo_job_read(posting, applicants.get(posting.job_id, 0), pending.get(posting.job_id, 0))
        for posting in postings
    ]


async def _read(session: AsyncSession, posting: DemoJobPosting) -> DemoJobRead:
    return (await _reads(session, [posting]))[0]


def _demo_job_read(posting: DemoJobPosting, applicant_count: int, pending_count: int) -> DemoJobRead:
    job = posting.job
    return DemoJobRead(
        id=job.id,
        title=job.title,
        department=job.department,
        location=job.location,
        work_arrangement=posting.work_arrangement,
        employment_type=job.employment_type,
        seniority=posting.seniority,
        skills=posting.skills,
        notes=posting.notes,
        summary=posting.summary,
        about_role=posting.about_role,
        responsibilities=posting.responsibilities,
        requirements=posting.requirements,
        preferred_qualifications=posting.preferred_qualifications,
        about_team=posting.about_team,
        salary_min=posting.salary_min,
        salary_max=posting.salary_max,
        salary_currency=posting.salary_currency,
        generated_by_model=posting.generated_by_model,
        status=posting.status,
        job_status=job.status,
        published_at=posting.published_at,
        closed_at=posting.closed_at,
        applicant_count=applicant_count,
        pending_count=pending_count,
        public_path=f"/demo/careers/{job.id}",
        created_at=posting.created_at,
        updated_at=posting.updated_at,
    )
