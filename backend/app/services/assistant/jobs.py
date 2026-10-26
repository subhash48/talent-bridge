"""Jobs through the assistant: a spoken or typed "create a job" is a draft, never a job.

The AI job writer (services/demo_jobs.write_posting, with its posting policy) drafts the posting from
what the recruiter said; the draft lives in the assistant's proposal until the recruiter approves it.
Follow-ups ("add Kubernetes and model monitoring", "make it hybrid") change that same draft. Only an
explicit approval creates the job, through job_service.create_job like the Jobs page's own form: an
open job on the careers site. What the recruiter didn't say is left empty for them to fill in, never
invented: salary, department and location included.
"""

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus
from app.models import Job
from app.schemas.assistant import JobChanges, JobDraft
from app.schemas.demo import JobPostingBrief, clean_list
from app.schemas.job import JobCreate
from app.services import demo_jobs, job_service
from app.services.ai.client import AIProvider

CURRENCY_SYMBOLS = {"USD": "$", "GBP": "£", "EUR": "€", "CAD": "CA$", "INR": "₹"}
# A department to start from, from the title; the recruiter sees it's a suggestion and can change it.
DEPARTMENTS = (
    (re.compile(r"\b(machine learning|ml|ai|data scien\w*|research\w*)\b", re.IGNORECASE), "Machine Learning"),
    (re.compile(r"\b(design\w*|ux|ui)\b", re.IGNORECASE), "Design"),
    (re.compile(r"\b(product manager|product owner)\b", re.IGNORECASE), "Product"),
    (re.compile(r"\b(engineer\w*|developer|devops|sre)\b", re.IGNORECASE), "Engineering"),
    (re.compile(r"\b(data|analyst|analytics)\b", re.IGNORECASE), "Data"),
    (re.compile(r"\b(sales|account executive)\b", re.IGNORECASE), "Sales"),
    (re.compile(r"\b(marketing)\b", re.IGNORECASE), "Marketing"),
    (re.compile(r"\b(recruit\w*|talent|people)\b", re.IGNORECASE), "People"),
)


TRAILING = re.compile(r"(?:\s+(?:experience|skills?|knowledge|background|too|as well|also|please))+$", re.IGNORECASE)


def skill_names(said: list[str]) -> list[str]:
    """Skills as said, tidied like the editor's chips: "talent research" becomes "Talent research", and
    "B2B SaaS experience" "B2B SaaS", as a hosted model may pass them."""
    tidy = [TRAILING.sub("", skill.strip()) for skill in said]
    return clean_list([skill[:1].upper() + skill[1:] if skill[:1].islower() else skill for skill in tidy if skill])


def salary_label(low: int | None, high: int | None, currency: str = "USD") -> str | None:
    """ "$150K–$180K", "From $90K", "Up to $120K"."""
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


def suggest_department(title: str) -> str | None:
    return next((name for pattern, name in DEPARTMENTS if pattern.search(title)), None)


async def draft(changes: JobChanges, provider: AIProvider) -> tuple[JobDraft, list[str], str]:
    """A draft from what the recruiter said, the things for them to check, and the model that wrote it.
    Nothing is saved."""
    assert changes.title
    said_skills = skill_names(changes.skills_add)
    brief = JobPostingBrief(
        title=changes.title,
        department=changes.department,
        location=changes.location,
        work_arrangement=changes.work_arrangement,
        employment_type=changes.employment_type or "Full-time",
        seniority=changes.seniority,
        skills=said_skills,
        notes=changes.notes,
    )
    generated = await demo_jobs.write_posting(brief, provider)
    content = generated.draft
    department = changes.department or suggest_department(changes.title)
    job = JobDraft(
        title=changes.title,
        department=department,
        location=changes.location,
        work_arrangement=changes.work_arrangement,
        employment_type=brief.employment_type,
        seniority=changes.seniority,
        salary_min=changes.salary_min,
        salary_max=changes.salary_max,
        skills=clean_list([*said_skills, *content.skills])[:20],
        summary=content.summary or None,
        responsibilities=content.responsibilities,
        requirements=content.requirements,
        preferred_qualifications=content.preferred_qualifications,
        description=content.about_role or None,
    )
    return job, checks(job, department_said=bool(changes.department)), generated.model_name


def checks(job: JobDraft, *, department_said: bool = True) -> list[str]:
    """What the recruiter should look at before creating it: what they didn't say."""
    notes = []
    if not job.department:
        notes.append("Department: not given")
    elif not department_said:
        notes.append(f"Department: “{job.department}” is a suggestion from the title")
    if not job.location:
        notes.append("Location: not given")
    if not job.work_arrangement:
        notes.append("Work arrangement: not given")
    if not job.seniority:
        notes.append("Seniority: not given")
    if job.salary_min is None and job.salary_max is None:
        notes.append("Salary: not given, and never guessed")
    if job.responsibilities or job.requirements or job.description:
        notes.append("Description, responsibilities and requirements: written by the AI from what you said; check them")
    return notes


def update(job: JobDraft, changes: JobChanges) -> tuple[JobDraft, list[str]]:
    """What the recruiter asked, applied to the same draft. Returns it and the changes, described."""
    values: dict[str, object] = {}
    described: list[str] = []
    for field, label in (
        ("title", "Title"),
        ("department", "Department"),
        ("location", "Location"),
        ("work_arrangement", "Work arrangement"),
        ("employment_type", "Employment type"),
        ("seniority", "Seniority"),
    ):
        value = getattr(changes, field)
        if value and value != getattr(job, field):
            values[field] = value
            described.append(f"{label}: {value}")
    if (changes.salary_min, changes.salary_max) != (None, None):
        low = changes.salary_min if changes.salary_min is not None else job.salary_min
        high = changes.salary_max if changes.salary_max is not None else job.salary_max
        if (low, high) != (job.salary_min, job.salary_max):
            values.update(salary_min=low, salary_max=high)
            described.append(f"Salary: {salary_label(low, high, job.salary_currency)}")
    removed = {skill.casefold() for skill in changes.skills_remove}
    kept = [skill for skill in job.skills if skill.casefold() not in removed]
    skills = clean_list([*kept, *skill_names(changes.skills_add)])[:20]
    if skills != job.skills:
        values["skills"] = skills
        before = {skill.casefold() for skill in job.skills}
        added = [skill for skill in skills if skill.casefold() not in before]
        if added:
            described.append(f"Added {_join(added)}")
        dropped = [skill for skill in job.skills if skill.casefold() in removed]
        if dropped:
            described.append(f"Removed {_join(dropped)}")
    return job.model_copy(update=values), described


async def create(session: AsyncSession, job: JobDraft) -> Job:
    """The recruiter approved it: an open job on the careers site, like one made on the Jobs page."""
    location = ", ".join(part for part in (job.location,) if part)
    if job.work_arrangement:
        location = f"{location} · {job.work_arrangement}" if location else job.work_arrangement
    created = await job_service.create_job(
        session,
        JobCreate(
            title=job.title,
            department=job.department,
            location=location or None,
            description=render_description(job),
            status=JobStatus.OPEN,
            employment_type=job.employment_type,
        ),
    )
    stored = await session.get(Job, created.id)
    assert stored is not None
    return stored


def render_description(job: JobDraft) -> str | None:
    """The job's description as the careers site reads it: the summary first (its card), the role, its
    lists, and the "Requirements:" line with the skills (the site's requirements, and the job-related
    criteria the shortlist starts from)."""
    facts = [
        f"Seniority: {job.seniority}" if job.seniority else None,
        f"Salary: {salary_label(job.salary_min, job.salary_max, job.salary_currency)}"
        if job.salary_min or job.salary_max
        else None,
    ]
    sections = [
        job.summary,
        job.description,
        _bullets("What you'll do", job.responsibilities),
        _bullets("What you'll bring", job.requirements),
        _bullets("Nice to have", job.preferred_qualifications),
        " · ".join(fact for fact in facts if fact) or None,
        f"Requirements: {', '.join(job.skills)}." if job.skills else None,
    ]
    text = "\n\n".join(section for section in sections if section)
    return text[:5000] or None


def _bullets(heading: str, items: list[str]) -> str | None:
    return "\n".join([heading, *(f"- {item}" for item in items)]) if items else None


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"
