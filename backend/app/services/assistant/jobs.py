"""Jobs through the assistant: the same demo jobs, AI job writer and publishing as the Jobs page.

A spoken or typed "create a job" drafts the posting with services/demo_jobs.write_posting and saves it
with create_demo_job, so it is an ordinary jobs row with its posting, exactly like one made in the
editor. Follow-ups ("make it hybrid", "salary 100 to 130") change that same draft through
update_demo_job. Publishing is proposed and only runs when the recruiter confirms (engine.confirm).
"""

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DemoJobPosting, User
from app.schemas.assistant import JobCard, JobCardJob, JobChanges
from app.schemas.demo import DemoJobCreate, DemoJobUpdate, JobPostingBrief, clean_list
from app.services import demo_jobs
from app.services.ai.client import AIProvider

CURRENCY_SYMBOLS = {"USD": "$", "GBP": "£", "EUR": "€", "CAD": "CA$", "INR": "₹"}
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def skill_names(said: list[str]) -> list[str]:
    """Skills as said, tidied like the editor's chips: "talent research" becomes "Talent research"."""
    return clean_list([skill[:1].upper() + skill[1:] if skill.islower() else skill for skill in said])


def salary_label(low: int | None, high: int | None, currency: str = "USD") -> str | None:
    """ "$100K–$130K", "From $90K", "Up to $120K"."""
    symbol = CURRENCY_SYMBOLS.get(currency, f"{currency} ")

    def amount(value: int) -> str:
        return f"{symbol}{value / 1000:g}K" if value >= 1000 else f"{symbol}{value:,}"

    if low and high:
        return f"{amount(low)}–{amount(high)}"
    if low:
        return f"From {amount(low)}"
    if high:
        return f"Up to {amount(high)}"
    return None


def card(
    posting: DemoJobPosting, *, stage: str, status: str, action_id: object = None, changes: list[str] | None = None
) -> JobCard:
    job = posting.job
    return JobCard(
        action_id=action_id,
        status=status,
        stage=stage,
        job=JobCardJob(
            id=job.id,
            title=job.title,
            location=job.location,
            work_arrangement=posting.work_arrangement,
            seniority=posting.seniority,
            employment_type=job.employment_type,
            salary=salary_label(posting.salary_min, posting.salary_max, posting.salary_currency),
            skills=list(posting.skills),
            summary=posting.summary,
            status=posting.status.value,
            review_path=f"/recruiter/jobs/demo/{job.id}",
            public_path=f"/demo/careers/{job.id}",
        ),
        changes=changes or [],
    )


async def create(
    session: AsyncSession, recruiter: User, changes: JobChanges, provider: AIProvider
) -> tuple[DemoJobPosting, str]:
    """A new draft written by the AI job writer from what the recruiter said. Never published."""
    assert changes.title
    brief = JobPostingBrief(
        title=changes.title,
        department=changes.department,
        location=changes.location,
        work_arrangement=changes.work_arrangement,
        employment_type=changes.employment_type or "Full-time",
        seniority=changes.seniority,
        skills=skill_names(changes.skills_add),
        notes=changes.notes,
    )
    generated = await demo_jobs.write_posting(brief, provider)
    draft = generated.draft
    created = await demo_jobs.create_demo_job(
        session,
        DemoJobCreate(
            title=brief.title,
            department=brief.department,
            location=brief.location,
            work_arrangement=brief.work_arrangement,
            employment_type=brief.employment_type,
            seniority=brief.seniority,
            notes=brief.notes,
            salary_min=changes.salary_min,
            salary_max=changes.salary_max,
            summary=draft.summary or None,
            about_role=draft.about_role or None,
            responsibilities=draft.responsibilities,
            requirements=draft.requirements,
            preferred_qualifications=draft.preferred_qualifications,
            skills=draft.skills or brief.skills,
            about_team=draft.about_team,
            generated_by_model=generated.model_name[:100],
        ),
        recruiter,
    )
    posting = await session.get(DemoJobPosting, created.id)
    assert posting is not None
    return posting, generated.model_name


async def update(
    session: AsyncSession, posting: DemoJobPosting, changes: JobChanges
) -> tuple[DemoJobPosting, list[str]]:
    """Apply what the recruiter asked to the same draft. Returns the changes, described for the card."""
    values: dict[str, object] = {}
    described: list[str] = []
    job = posting.job
    for field, label in (
        ("title", "Title"),
        ("department", "Department"),
        ("location", "Location"),
        ("work_arrangement", "Work arrangement"),
        ("employment_type", "Employment type"),
        ("seniority", "Seniority"),
    ):
        value = getattr(changes, field)
        current = getattr(job, field) if field in demo_jobs.JOB_FIELDS else getattr(posting, field)
        if value and value != current:
            values[field] = value
            described.append(f"{label}: {value}")
    low = changes.salary_min if changes.salary_min is not None else posting.salary_min
    high = changes.salary_max if changes.salary_max is not None else posting.salary_max
    if (changes.salary_min, changes.salary_max) != (None, None) and (low, high) != (
        posting.salary_min,
        posting.salary_max,
    ):
        values.update(salary_min=low, salary_max=high)
        described.append(f"Salary: {salary_label(low, high, posting.salary_currency)}")
    removed = {skill.lower() for skill in changes.skills_remove}
    skills = clean_list(
        [skill for skill in posting.skills if skill.lower() not in removed] + skill_names(changes.skills_add)
    )
    if skills != list(posting.skills):
        values["skills"] = skills[:20]
        added = [skill for skill in skills if skill.lower() not in {s.lower() for s in posting.skills}]
        if added:
            described.append(f"Added {', '.join(added)}")
        if removed & {skill.lower() for skill in posting.skills}:
            described.append(f"Removed {', '.join(s for s in posting.skills if s.lower() in removed)}")
    if changes.shorter:
        values.update(shortened(posting))
        described.append("Shorter description")
    if values:
        await demo_jobs.update_demo_job(session, posting.job_id, DemoJobUpdate(**values))
        await session.refresh(posting)
        await session.refresh(posting.job)
    return posting, described


def shortened(posting: DemoJobPosting) -> dict[str, object]:
    """A tighter posting from the same text: the first sentence or two of each part, fewer bullets."""
    return {
        "summary": _sentences(posting.summary, 1),
        "about_role": _sentences(posting.about_role, 2),
        "about_team": _sentences(posting.about_team, 1),
        "responsibilities": posting.responsibilities[:4],
        "requirements": posting.requirements[:4],
        "preferred_qualifications": posting.preferred_qualifications[:2],
    }


def _sentences(text: str | None, count: int) -> str | None:
    if not text:
        return text
    return " ".join(_SENTENCE.split(text.strip())[:count])
