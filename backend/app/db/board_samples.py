"""Sample employers for the public job board: five recruiting teams and five small businesses, each with one open
job, so the board shows more than one company and both tabs have jobs. Every company here is fictional.

    python -m app.db.board_samples                  add them to DATABASE_URL (rows already there are left alone)
    python -m app.db.board_samples --owner EMAIL    also make EMAIL the owner of Bluebird Coffee Co., a Simple Hire
                                                    workspace, linked to the Supabase account with that email
    python -m app.db.board_samples --hide           close their jobs, so the board stops listing them

Ids are deterministic (the demo seed's), so running it again adds nothing new. Nothing else is changed.
"""

import argparse
import asyncio
from typing import Any

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus, SalaryPeriod, UserRole, WorkArrangement, WorkspaceMode
from app.db.seed import company_row, job_row, resolve, seed_id
from app.db.seed_data import CompanySeed, JobSeed
from app.models import Company, Job, User
from app.models.base import utcnow
from app.services.account_service import find_auth_account, link_account

FICTIONAL = "Fictional sample employer, added to show the Hirvello job board with more than one company."
YEAR, HOUR = SalaryPeriod.YEAR, SalaryPeriod.HOUR
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday")


def _company(
    key: str, name: str, overview: str, location: str, process: tuple[str, ...], mode: WorkspaceMode
) -> CompanySeed:
    return CompanySeed(
        key,
        name,
        30,
        None,
        None,
        overview=overview,
        mission="",
        highlights=(),
        products=(),
        values=(),
        benefits=(),
        benefits_scope="",
        benefits_note="",
        locations=(location,),
        locations_note="",
        hiring_process=process,
        hiring_note="",
        links=(),
        source=FICTIONAL,
        workspace_mode=mode,
    )


FULL, SIMPLE = WorkspaceMode.FULL, WorkspaceMode.SIMPLE
RECRUITER_PROCESS = ("Apply", "Recruiter call", "Interviews with the team", "Offer")
SMALL_PROCESS = ("Apply", "A short call with the owner", "A trial shift")

COMPANIES: tuple[CompanySeed, ...] = (
    _company(
        "fernbrook-analytics",
        "Fernbrook Analytics",
        "Demand forecasting software for independent retailers.",
        "Remote (US)",
        RECRUITER_PROCESS,
        FULL,
    ),
    _company(
        "halcyon-health",
        "Halcyon Health",
        "Scheduling and reminders software for community clinics.",
        "Boston, MA",
        RECRUITER_PROCESS,
        FULL,
    ),
    _company(
        "ridgeline-freight",
        "Ridgeline Freight",
        "Route planning and tracking for regional trucking fleets.",
        "Chicago, IL",
        RECRUITER_PROCESS,
        FULL,
    ),
    _company(
        "lanternfish-learning",
        "Lanternfish Learning",
        "Live online tutoring for middle and high school students.",
        "Remote (US)",
        RECRUITER_PROCESS,
        FULL,
    ),
    _company(
        "solvane-energy",
        "Solvane Energy",
        "Home solar and battery installations across the Mountain West.",
        "Denver, CO",
        RECRUITER_PROCESS,
        FULL,
    ),
    _company(
        "bluebird-coffee",
        "Bluebird Coffee Co.",
        "A neighbourhood coffee shop and bakery.",
        "Austin, TX",
        SMALL_PROCESS,
        SIMPLE,
    ),
    _company(
        "greenleaf-landscaping",
        "Greenleaf Landscaping",
        "Garden care and landscaping for homes and offices.",
        "Sacramento, CA",
        SMALL_PROCESS,
        SIMPLE,
    ),
    _company(
        "elm-street-auto",
        "Elm Street Auto Repair",
        "A family-run garage for servicing and repairs.",
        "Columbus, OH",
        SMALL_PROCESS,
        SIMPLE,
    ),
    _company(
        "sunny-paws",
        "Sunny Paws Pet Care",
        "Dog walking, pet sitting and drop-in visits.",
        "Seattle, WA",
        SMALL_PROCESS,
        SIMPLE,
    ),
    _company(
        "harbor-lane-dental",
        "Harbor Lane Dental",
        "A friendly family dental practice.",
        "San Diego, CA",
        SMALL_PROCESS,
        SIMPLE,
    ),
)


def _recruiter_job(
    company: str,
    title: str,
    department: str,
    location: str,
    manager: str,
    days: int,
    summary: str,
    requirements: tuple[str, ...],
    salary: tuple[int, int],
) -> JobSeed:
    return JobSeed(
        title,
        department,
        location,
        manager,
        days,
        summary,
        requirements,
        company=company,
        seed_key=f"{company}:{title}",
        salary=(*salary, "USD", YEAR),
    )


def _small_job(
    company: str,
    title: str,
    location: str,
    owner: str,
    days: int,
    summary: str,
    requirements: tuple[str, ...],
    hourly: tuple[int, int],
    shift: str,
    work_days: tuple[str, ...],
    openings: int,
    employment_type: str,
) -> JobSeed:
    low, high = hourly
    return JobSeed(
        title,
        "",
        location,
        owner,
        days,
        summary,
        requirements,
        company=company,
        seed_key=f"{company}:{title}",
        pay=f"${low}–${high}/hour",
        shift=shift,
        work_days=work_days,
        openings=openings,
        employment_type=employment_type,
        salary=(low, high, "USD", HOUR),
        work_arrangement=WorkArrangement.ONSITE,
    )


JOBS: tuple[JobSeed, ...] = (
    _recruiter_job(
        "fernbrook-analytics",
        "Senior Data Engineer",
        "Data",
        "Remote (US)",
        "Priya Natarajan",
        1,
        "Build the pipelines that turn point-of-sale data from 2,000 shops into daily forecasts.",
        ("5+ years building data pipelines", "Python and SQL", "Airflow or Dagster"),
        (150_000, 180_000),
    ),
    _recruiter_job(
        "halcyon-health",
        "Product Designer",
        "Design",
        "Boston, MA · Hybrid",
        "Marcus Bell",
        2,
        "Design the booking and reminder flows patients and front-desk staff use every day.",
        ("3+ years of product design", "A portfolio of shipped work", "Figma"),
        (115_000, 135_000),
    ),
    _recruiter_job(
        "ridgeline-freight",
        "Backend Engineer",
        "Engineering",
        "Chicago, IL · On-site",
        "Hannah Ortiz",
        3,
        "Own the services that plan routes and track 4,000 trucks in real time.",
        ("3+ years of backend development", "Go or Java", "PostgreSQL"),
        (130_000, 155_000),
    ),
    _recruiter_job(
        "lanternfish-learning",
        "Customer Success Manager",
        "Customer Success",
        "Remote (US)",
        "Tomás Rivera",
        4,
        "Help school districts get their students tutoring that works, from launch to renewal.",
        ("2+ years in customer success or account management", "Clear, kind communication"),
        (75_000, 90_000),
    ),
    _recruiter_job(
        "solvane-energy",
        "Marketing Manager",
        "Marketing",
        "Denver, CO · Hybrid",
        "Grace Kim",
        5,
        "Plan and run the campaigns that bring homeowners to their first solar consultation.",
        ("4+ years in marketing", "Paid search and social", "Budget ownership"),
        (95_000, 110_000),
    ),
    _small_job(
        "bluebird-coffee",
        "Barista",
        "Austin, TX",
        "Jordan Lee",
        1,
        "Bluebird Coffee Co. is hiring 2 baristas in Austin, TX: morning shifts, Monday to Friday, $16–$19/hour.",
        ("Friendly with customers", "Coffee experience a plus"),
        (16, 19),
        "Mornings",
        WEEKDAYS,
        2,
        "Part-time",
    ),
    _small_job(
        "greenleaf-landscaping",
        "Landscaping Crew Member",
        "Sacramento, CA",
        "Luis Romero",
        2,
        "Greenleaf Landscaping is hiring 3 crew members in Sacramento, CA: day shifts, Monday to Friday, $20–$24/hour.",
        ("Happy working outdoors", "Driver's license"),
        (20, 24),
        "Days",
        WEEKDAYS,
        3,
        "Full-time",
    ),
    _small_job(
        "elm-street-auto",
        "Auto Technician",
        "Columbus, OH",
        "Dana Walsh",
        3,
        "Elm Street Auto Repair is hiring an auto technician in Columbus, OH: days, Monday to Saturday, $24–$30/hour.",
        ("2+ years as a technician", "Own basic tools"),
        (24, 30),
        "Days",
        (*WEEKDAYS, "saturday"),
        1,
        "Full-time",
    ),
    _small_job(
        "sunny-paws",
        "Dog Walker",
        "Seattle, WA",
        "Mia Chen",
        4,
        "Sunny Paws Pet Care is hiring 2 dog walkers in Seattle, WA: afternoons, Monday to Friday, $19–$22/hour.",
        ("Loves dogs", "Reliable and on time"),
        (19, 22),
        "Afternoons",
        WEEKDAYS,
        2,
        "Part-time",
    ),
    _small_job(
        "harbor-lane-dental",
        "Front Desk Receptionist",
        "San Diego, CA",
        "Dr. Anita Shah",
        5,
        "Harbor Lane Dental is hiring a front desk receptionist in San Diego, CA: days, Monday to Thursday, $21–$24/hour.",
        ("Front desk or reception experience", "Comfortable on the phone"),
        (21, 24),
        "Days",
        WEEKDAYS[:4],
        1,
        "Full-time",
    ),
)
OWNED_COMPANY = "bluebird-coffee"  # the one the test owner signs in to
JOB_IDS = [seed_id("job", job.key) for job in JOBS]


def sample_rows() -> dict[str, list[dict[str, Any]]]:
    """The companies and jobs rows, with times still relative (resolve() fixes them)."""
    modes = {company.key: company.workspace_mode for company in COMPANIES}
    return {
        "companies": [company_row(company) for company in COMPANIES],
        "jobs": [job_row(job, modes[job.company]) for job in JOBS],
    }


async def add_samples(session: AsyncSession) -> dict[str, int]:
    """Insert the sample companies and jobs the database doesn't have yet, in one transaction."""
    now = utcnow()
    added: dict[str, int] = {}
    for model, rows in ((Company, sample_rows()["companies"]), (Job, sample_rows()["jobs"])):
        existing = set((await session.scalars(select(model.id).where(model.id.in_([row["id"] for row in rows])))).all())
        new = [{key: resolve(value, now) for key, value in row.items()} for row in rows if row["id"] not in existing]
        if new:
            await session.execute(insert(model.__table__), new)
        added[model.__tablename__] = len(new)
    await session.commit()
    return added


async def add_owner(session: AsyncSession, email: str, full_name: str) -> str:
    """Make `email` the owner (admin) of the sample Simple Hire business, linked to its Supabase account if one
    exists. An existing users row with that email is never given a different company or role."""
    email = email.strip().lower()
    company_id = seed_id("company", OWNED_COMPANY)
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        session.add(User(email=email, full_name=full_name, role=UserRole.ADMIN, company_id=company_id))
        await session.commit()
    elif user.company_id != company_id or user.role != UserRole.ADMIN:
        return f"{email} already belongs to another workspace or role; left unchanged."
    account = await find_auth_account(session, email=email)
    if account is None:
        return f"{email} owns {OWNED_COMPANY}; no Supabase account with that email yet (link it later with app.db.accounts)."
    await link_account(session, email, account.id)
    return f"{email} owns {OWNED_COMPANY} and signs in with its Supabase account."


async def hide_samples(session: AsyncSession) -> int:
    """Close the sample jobs (applications stay), so the board stops listing them."""
    result = await session.execute(
        update(Job).where(Job.id.in_(JOB_IDS), Job.status == JobStatus.OPEN).values(status=JobStatus.CLOSED)
    )
    await session.commit()
    return result.rowcount or 0


async def _main(args: argparse.Namespace) -> None:
    from app.core.database import dispose_engine, get_engine, get_sessionmaker

    where = get_engine().url.render_as_string(hide_password=True)
    async with get_sessionmaker()() as session:
        if args.hide:
            print(f"Closed {await hide_samples(session)} sample jobs in {where}.")
        else:
            added = await add_samples(session)
            print(f"Added to {where}: {added['companies']} companies, {added['jobs']} jobs.")
            if args.owner:
                print(await add_owner(session, args.owner, args.owner_name))
    await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description="Add fictional sample employers to the public job board.")
    parser.add_argument("--owner", metavar="EMAIL", help="make EMAIL the owner of Bluebird Coffee Co. (Simple Hire)")
    parser.add_argument("--owner-name", default="Jordan Lee", help="the owner's name (default: Jordan Lee)")
    parser.add_argument("--hide", action="store_true", help="close the sample jobs instead")
    asyncio.run(_main(parser.parse_args()))


if __name__ == "__main__":
    main()
