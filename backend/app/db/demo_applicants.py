"""Development only: fictional people applying to a job, the way real applicants do.

    python -m app.db.demo_applicants "Cashier"                    # the newest open job with that title
    python -m app.db.demo_applicants "Cashier" --company sams-cafe

Each one applies through the careers site's own path (services/careers.apply): name, a .example email, a
555 phone number, a small résumé, the job's work days they can work, and their experience in their own
words. Nothing is emailed (no portal links are sent from here), and applying again adds nothing. It refuses
to run with ENVIRONMENT=production.
"""

import argparse
import asyncio
import base64
import io
import zipfile
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import JobStatus, Weekday
from app.models import Company, Job
from app.schemas.careers import ApplicationCreate, ApplicationResult
from app.schemas.demo import ResumeUpload
from app.services import careers


@dataclass(frozen=True)
class DemoApplicant:
    first_name: str
    last_name: str
    phone: str
    days: tuple[Weekday, ...]  # the days they can work, kept to the job's own
    experience: str


W = Weekday
SERVICE = (
    DemoApplicant(
        "Grace", "Liu", "+1 503 555 0151", (W.SATURDAY, W.SUNDAY), "Three years as a cashier at a grocery store."
    ),
    DemoApplicant(
        "Omar", "Haddad", "+1 503 555 0152", (W.SATURDAY, W.SUNDAY), "Two years of customer service at a phone shop."
    ),
    DemoApplicant(
        "Priya", "Raman", "+1 503 555 0153", (W.SATURDAY, W.SUNDAY), "Barista at a busy coffee shop on weekends."
    ),
    DemoApplicant(
        "Ben", "Carter", "+1 503 555 0154", (W.SATURDAY, W.SUNDAY), "Warehouse picking and packing for a year."
    ),
    DemoApplicant("Chloe", "Martin", "+1 503 555 0155", (W.SATURDAY,), "Customer service at a hotel front desk."),
    DemoApplicant("Diego", "Alvarez", "+1 503 555 0156", (W.FRIDAY,), "I'm a student looking for my first job."),
)


def resume(applicant: DemoApplicant) -> ResumeUpload:
    """A one-page DOCX with their name and experience: enough for the careers site to accept."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        lines = [f"{applicant.first_name} {applicant.last_name}", applicant.experience]
        body = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in lines)
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{body}</w:body></w:document>",
        )
    data = base64.b64encode(buffer.getvalue()).decode()
    return ResumeUpload(file_name=f"{applicant.first_name} {applicant.last_name} CV.docx", data=data)


async def find_job(session: AsyncSession, title: str, company: str | None = None) -> Job | None:
    query = select(Job).where(Job.status == JobStatus.OPEN, Job.external_id.is_(None)).order_by(Job.created_at.desc())
    if company:
        query = query.join(Company).where(Company.slug == company)
    return next((job for job in await session.scalars(query) if title.lower() in job.title.lower()), None)


async def apply_all(
    session: AsyncSession, job: Job, applicants: tuple[DemoApplicant, ...] = SERVICE
) -> list[ApplicationResult]:
    if settings.environment == "production":
        raise RuntimeError("Demo applicants are for development only.")
    offered = set(job.work_days or [])
    results = []
    for applicant in applicants:
        # Their days, kept to the job's; someone free on none of them offers the job's first day instead.
        days = [day for day in applicant.days if day.value in offered]
        if offered and not days:
            days = [next(day for day in Weekday if day.value in offered)]
        body = ApplicationCreate(
            first_name=applicant.first_name,
            last_name=applicant.last_name,
            email=f"{applicant.first_name}.{applicant.last_name}@applicants.example".lower(),
            phone=applicant.phone,
            resume=resume(applicant),
            availability=days,
            experience_note=applicant.experience,
        )
        results.append(await careers.apply(session, job.id, body, admin=None))
    return results


async def _main(title: str, company: str | None) -> None:
    from app.core.database import dispose_engine, get_sessionmaker

    async with get_sessionmaker()() as session:
        job = await find_job(session, title, company)
        if job is None:
            print(f"No open job called {title!r}" + (f" at {company}" if company else "") + ". Post it first.")
            return
        where = f"{job.title} at {job.company.name}"
        results = await apply_all(session, job)
    await dispose_engine()
    added = sum(result.status == "submitted" for result in results)
    print(f"{added} demo applicants applied to {where} ({len(results) - added} already had).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Development only: fictional people apply to an open job.")
    parser.add_argument("title", help="part of the job's title, like Cashier")
    parser.add_argument("--company", help="the company's slug, like sams-cafe")
    args = parser.parse_args()
    asyncio.run(_main(args.title, args.company))


if __name__ == "__main__":
    main()
