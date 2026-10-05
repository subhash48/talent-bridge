"""Development only: months of made-up candidate portal activity, so the Analytics page has something real
to calculate from.

    python -m app.services.analytics.demo_activity generate   # replaces what it generated before
    python -m app.services.analytics.demo_activity reset

It writes raw records, never results: candidates with an application each (to the open jobs), some of
them with voluntary demographic answers, and their portal visits with the page, section and feature
views and assistant-question topics those visits would produce. Visits and events go through the same
models and the same event recorder (services/engagement/events.record_event) as real portal activity,
so every percentage on the page comes out of the same calculations as it would for real candidates.

Everything it makes carries a tb-demo-analytics- Ashby id, so this script's reset and the Ashby
simulator's reset (python -m app.integrations.ashby.demo reset) delete it, and nothing else. It
refuses to run when ENVIRONMENT=production, and writes to the database in DATABASE_URL, which it
names before writing anything.
"""

import argparse
import asyncio
import random
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import (
    ActivityType,
    ApplicationStage,
    CompanySection,
    DisabilityStatus,
    EngagementEventType,
    JobStatus,
    PortalPage,
    PortalTopic,
    RaceEthnicity,
    Region,
    SexualOrientation,
)
from app.integrations.ashby.demo_ids import DEMO_PREFIX, demo_id
from app.models import Application, Candidate, CandidateDemographics, Job, PortalSession
from app.models.base import utcnow
from app.services.activity_service import record_activity
from app.services.application_service import record_stage
from app.services.engagement.events import record_event

PREFIX = f"{DEMO_PREFIX}analytics-"
SOURCE = "Ashby Simulator / Analytics demo"
E = EngagementEventType

FIRST_NAMES = (
    "Adaeze",
    "Ahmed",
    "Alana",
    "Aleksander",
    "Amelia",
    "Andre",
    "Anika",
    "Beatriz",
    "Callum",
    "Camila",
    "Chidi",
    "Dmitri",
    "Eitan",
    "Emre",
    "Esther",
    "Farah",
    "Felix",
    "Freya",
    "Gabriel",
    "Hamza",
    "Ines",
    "Irene",
    "Ivan",
    "Jae",
    "Javier",
    "Kai",
    "Kavya",
    "Laila",
    "Lars",
    "Lena",
    "Liam",
    "Lucia",
    "Malik",
    "Mara",
    "Mei",
    "Nadia",
    "Nikhil",
    "Oscar",
    "Paulo",
    "Quinn",
    "Rania",
    "Rohan",
    "Rosa",
    "Saanvi",
    "Selin",
    "Soren",
    "Tariq",
    "Tessa",
    "Thiago",
    "Uma",
    "Valentina",
    "Vikram",
    "Wen",
    "Xavier",
    "Yara",
    "Yusuf",
    "Zainab",
    "Zane",
    "Elif",
    "Mateus",
)
LAST_NAMES = (
    "Abara",
    "Bianchi",
    "Brennan",
    "Castillo",
    "Dang",
    "Eriksen",
    "Farouk",
    "Gallagher",
    "Hoffmann",
    "Ibrahim",
    "Iyer",
    "Jensen",
    "Kapoor",
    "Kovacs",
    "Laurent",
    "Lindgren",
    "Mahmoud",
    "Mendes",
    "Murphy",
    "Nakamura",
    "Nguyen",
    "Oduya",
    "Olsen",
    "Pereira",
    "Quinlan",
    "Rahman",
    "Reyes",
    "Sandoval",
    "Schmidt",
    "Shah",
    "Singh",
    "Sorensen",
    "Takahashi",
    "Torres",
    "Ueda",
    "Varga",
    "Vasquez",
    "Weber",
    "Yilmaz",
    "Zielinski",
)
SKILLS = ("Python", "SQL", "Figma", "Product strategy", "PyTorch", "Distributed systems", "Recruiting", "TypeScript")
REGION_PLACES = {
    Region.UNITED_STATES: ("San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA"),
    Region.INDIA: ("Bengaluru, India", "Pune, India", "Hyderabad, India"),
    Region.UNITED_KINGDOM: ("London, UK", "Manchester, UK"),
    Region.CANADA: ("Toronto, Canada", "Vancouver, Canada"),
    Region.GERMANY: ("Berlin, Germany", "Munich, Germany"),
    Region.OTHER: ("Lisbon, Portugal", "Singapore", "Sydney, Australia", "São Paulo, Brazil"),
    Region.PREFER_NOT_TO_SAY: (None,),
}

# Weights, not results: the page's percentages come from what these random draws produce.
REGION_WEIGHTS = {
    Region.UNITED_STATES: 38,
    Region.INDIA: 18,
    Region.UNITED_KINGDOM: 12,
    Region.CANADA: 8,
    Region.GERMANY: 6,
    Region.OTHER: 12,
    Region.PREFER_NOT_TO_SAY: 6,
}
RACE_WEIGHTS = {
    RaceEthnicity.ASIAN: 24,
    RaceEthnicity.WHITE: 30,
    RaceEthnicity.HISPANIC_LATINO: 13,
    RaceEthnicity.BLACK: 11,
    RaceEthnicity.MIDDLE_EASTERN_NORTH_AFRICAN: 6,
    RaceEthnicity.MULTIRACIAL: 5,
    RaceEthnicity.ANOTHER_IDENTITY: 2,
    RaceEthnicity.PREFER_NOT_TO_SAY: 9,
}
DISABILITY_WEIGHTS = {DisabilityStatus.NO: 78, DisabilityStatus.YES: 9, DisabilityStatus.PREFER_NOT_TO_SAY: 13}
ORIENTATION_WEIGHTS = {
    SexualOrientation.STRAIGHT: 72,
    SexualOrientation.BISEXUAL: 7,
    SexualOrientation.GAY: 4,
    SexualOrientation.LESBIAN: 2,
    SexualOrientation.QUEER: 2,
    SexualOrientation.ASEXUAL: 1,
    SexualOrientation.ANOTHER_IDENTITY: 1,
    SexualOrientation.PREFER_NOT_TO_SAY: 11,
}
STAGE_WEIGHTS = {
    ApplicationStage.SCREENING: 34,
    ApplicationStage.INTERVIEW: 24,
    ApplicationStage.SOURCED: 8,
    ApplicationStage.OFFER: 5,
    ApplicationStage.HIRED: 4,
    ApplicationStage.REJECTED: 25,
}
PAGE_WEIGHTS = {
    PortalPage.APPLICATION: 24,
    PortalPage.INTERVIEWS: 16,
    PortalPage.PREP: 13,
    PortalPage.COMPANY: 13,
    PortalPage.MESSAGES: 14,
    PortalPage.APPLICATIONS: 7,
    PortalPage.AI: 9,
    PortalPage.PROFILE: 4,
}
SECTION_CHANCES = {
    CompanySection.BENEFITS: 0.45,
    CompanySection.CULTURE: 0.4,
    CompanySection.PRODUCTS: 0.2,
    CompanySection.HIRING: 0.15,
    CompanySection.LOCATIONS: 0.1,
}
QUESTION_WEIGHTS = {
    PortalTopic.INTERVIEW_PREPARATION: 34,
    PortalTopic.APPLICATION_STATUS: 20,
    PortalTopic.COMPENSATION: 18,
    PortalTopic.BENEFITS: 12,
    PortalTopic.CULTURE_TEAM: 10,
    PortalTopic.COMPANY_INFORMATION: 6,
}
# Local hours candidates visit: evenings and lunchtimes, a peak mid-afternoon, quieter weekends.
HOUR_WEIGHTS = (1, 1, 0, 0, 0, 1, 2, 4, 6, 8, 9, 10, 11, 10, 12, 24, 22, 11, 9, 10, 11, 8, 5, 2)
DAY_WEIGHTS = (13, 22, 15, 14, 12, 6, 7)  # Monday first


@dataclass(frozen=True)
class Result:
    candidates: int
    visits: int
    events: int
    demographics: int


def require_development() -> None:
    if settings.environment == "production":
        raise SystemExit(
            "Demo analytics activity is for development only and ENVIRONMENT is production. Nothing was changed."
        )


async def generate(
    factory: async_sessionmaker[AsyncSession], *, candidates: int = 160, days: int = 150, seed: int = 7
) -> Result:
    """Replace any earlier generated activity with a fresh set, timed relative to now."""
    require_development()
    await reset(factory)
    rng = random.Random(seed)
    now = utcnow()
    local = datetime.now().astimezone().utcoffset() or timedelta()
    async with factory() as session:
        jobs = (await session.scalars(select(Job).where(Job.status == JobStatus.OPEN).order_by(Job.created_at))).all()
        if not jobs:
            raise SystemExit("There are no open jobs to give the demo candidates applications to. Nothing was changed.")
        taken = {name.lower() for name in await session.scalars(select(Candidate.first_name))}
        firsts = [name for name in FIRST_NAMES if name.lower() not in taken]

        visits = events = answered = 0
        for index in range(candidates):
            # More candidates arrive recently, so engagement grows over the period.
            applied = now - timedelta(days=days * (1 - rng.random() ** 0.9), minutes=rng.randint(0, 600))
            candidate, application = _person(rng, index, firsts, jobs, applied, now)
            session.add(candidate)
            await session.flush()
            application.candidate_id = candidate.id
            session.add(application)
            await session.flush()
            record_stage(session, application.id, None, application.stage, applied)
            record_activity(
                session,
                application.id,
                ActivityType.APPLICATION_CREATED,
                "Applied",
                metadata={"source": SOURCE},
                at=applied,
            )
            if rng.random() < 0.68:
                session.add(_demographics(rng, candidate.id, candidate.location))
                answered += 1
            made_visits, made_events = await _visits(session, rng, candidate.id, application.id, applied, now, local)
            visits += made_visits
            events += made_events
            if index % 20 == 19:
                await session.commit()
        await session.commit()
    return Result(candidates=candidates, visits=visits, events=events, demographics=answered)


async def reset(factory: async_sessionmaker[AsyncSession]) -> int:
    """Delete what generate() made: its candidates, with their applications, visits, events and answers."""
    require_development()
    async with factory() as session:
        await session.execute(delete(Application).where(Application.external_id.startswith(PREFIX)))
        result = await session.execute(delete(Candidate).where(Candidate.external_id.startswith(PREFIX)))
        await session.commit()
        return result.rowcount or 0  # type: ignore[attr-defined]


def _person(
    rng: random.Random, index: int, firsts: Sequence[str], jobs: Sequence[Job], applied: datetime, now: datetime
) -> tuple[Candidate, Application]:
    first, last = rng.choice(firsts), rng.choice(LAST_NAMES)
    region = _pick(rng, REGION_WEIGHTS)
    stage = _pick(rng, STAGE_WEIGHTS)
    # Older finished applications have left the active pipeline; their portal history stays.
    finished = now - applied > timedelta(days=45) and stage in (ApplicationStage.REJECTED, ApplicationStage.HIRED)
    candidate = Candidate(
        id=uuid.uuid4(),
        external_id=demo_id("analytics", "candidate", str(index)),
        first_name=first,
        last_name=last,
        email=f"{first}.{last}.{index}@analytics-demo.example".lower(),
        location=rng.choice(REGION_PLACES[region]),
        skills=rng.sample(SKILLS, 3),
        created_at=applied,
        updated_at=applied,
    )
    application = Application(
        id=uuid.uuid4(),
        job_id=rng.choice(jobs).id,
        stage=stage,
        source=SOURCE,
        applied_at=applied,
        updated_at=applied,
        external_id=demo_id("analytics", "application", str(index)),
        archived_at=now - timedelta(days=rng.randint(1, 20)) if finished else None,
    )
    return candidate, application


def _demographics(rng: random.Random, candidate_id: uuid.UUID, location: str | None) -> CandidateDemographics:
    region = next((r for r, places in REGION_PLACES.items() if location in places), Region.PREFER_NOT_TO_SAY)
    answers = {
        "region": region.value,
        "race_ethnicity": _pick(rng, RACE_WEIGHTS).value if rng.random() < 0.9 else None,
        "disability_status": _pick(rng, DISABILITY_WEIGHTS).value if rng.random() < 0.85 else None,
        "sexual_orientation": _pick(rng, ORIENTATION_WEIGHTS).value if rng.random() < 0.8 else None,
    }
    return CandidateDemographics(candidate_id=candidate_id, **answers)


async def _visits(
    session: AsyncSession,
    rng: random.Random,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID,
    applied: datetime,
    now: datetime,
    local: timedelta,
) -> tuple[int, int]:
    count = 1 + min(int(rng.expovariate(0.35)), 14) if rng.random() < 0.93 else 0
    window_end = min(now, applied + timedelta(days=60))
    starts = sorted(_moment(rng, applied, window_end, local) for _ in range(count))
    events = 0
    for started in starts:
        if started >= now:
            continue
        active = int(min(3600, max(20, rng.lognormvariate(5.7, 0.7))))
        row = PortalSession(
            id=uuid.uuid4(),
            candidate_id=candidate_id,
            application_id=application_id,
            client_session_id=uuid.uuid4(),
            started_at=started,
            last_active_at=started + timedelta(seconds=active),
            ended_at=started + timedelta(seconds=active),
            active_seconds=active,
            page_views=0,
        )
        session.add(row)
        await session.flush()  # the visit exists before the events that point at it
        await record_event(session, candidate_id, E.PORTAL_SESSION_STARTED, application_id=application_id, at=started)
        moments = sorted(started + timedelta(seconds=rng.randint(1, max(2, active))) for _ in range(rng.randint(1, 5)))
        pages = [PortalPage.DASHBOARD] + [_pick(rng, PAGE_WEIGHTS) for _ in moments[1:]]
        for at, page in zip(moments, pages, strict=False):
            events += await _page(session, rng, candidate_id, application_id, row.id, page, at)
        row.page_views = len(pages)
        events += 1
    return len(starts), events


async def _page(
    session: AsyncSession,
    rng: random.Random,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID,
    session_id: uuid.UUID,
    page: PortalPage,
    at: datetime,
) -> int:
    """One page view and what opening it records, as the portal and the API do."""

    async def event(event_type: EngagementEventType, **meta: str) -> None:
        await record_event(
            session,
            candidate_id,
            event_type,
            application_id=application_id,
            session_id=session_id,
            metadata=meta or None,
            source="candidate_portal",
            at=at,
        )

    await event(E.PAGE_VIEW, target=page.value)
    made = 1
    if page == PortalPage.APPLICATION:
        await event(E.APPLICATION_VIEWED)
        made += 1
    elif page == PortalPage.PREP:
        await event(E.PREP_VIEWED)
        made += 1
    elif page == PortalPage.MESSAGES and rng.random() < 0.6:
        await event(E.MESSAGE_READ)
        made += 1
    elif page == PortalPage.COMPANY:
        for section, chance in SECTION_CHANCES.items():
            if rng.random() < chance:
                await event(E.COMPANY_SECTION_VIEWED, target=section.value)
                made += 1
    elif page == PortalPage.AI:
        for _ in range(rng.randint(1, 3)):
            await event(E.AI_QUESTION_ASKED, topic=_pick(rng, QUESTION_WEIGHTS).value)
            made += 1
    return made


def _moment(rng: random.Random, start: datetime, end: datetime, local: timedelta) -> datetime:
    """A visit time between start and end, at a local hour and weekday candidates tend to visit, later
    dates more likely."""
    span = max((end - start).total_seconds(), 3600)
    for _ in range(40):
        day = (start + timedelta(seconds=span * rng.random() ** 0.9) + local).date()
        if rng.random() * max(DAY_WEIGHTS) <= DAY_WEIGHTS[day.weekday()]:
            break
    hour = rng.choices(range(24), weights=HOUR_WEIGHTS)[0]
    moment = datetime(day.year, day.month, day.day, hour, rng.randint(0, 59), tzinfo=UTC) - local
    return min(max(moment, start + timedelta(minutes=5)), end)


def _pick[Key](rng: random.Random, weights: dict[Key, int]) -> Key:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


async def _main(command: str, candidates: int, days: int, seed: int) -> None:
    from app.core.database import create_tables, dispose_engine, get_engine, get_sessionmaker

    require_development()
    engine = get_engine()
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    if engine.dialect.name == "sqlite":
        await create_tables(engine)
    factory = get_sessionmaker()
    if command == "reset":
        print(f"Deleted {await reset(factory)} generated candidate(s) with their portal activity.")
    else:
        result = await generate(factory, candidates=candidates, days=days, seed=seed)
        async with factory() as session:
            total = await session.scalar(select(func.count()).select_from(PortalSession))
        print(
            f"Generated {result.candidates} candidates, {result.visits} portal visits, {result.events} portal events "
            f"and {result.demographics} voluntary demographic responses over {days} days ({total} visits in all)."
        )
    await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description="Development only: made-up candidate portal activity for Analytics.")
    parser.add_argument("command", choices=("generate", "reset"))
    parser.add_argument("--candidates", type=int, default=160)
    parser.add_argument("--days", type=int, default=150)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    asyncio.run(_main(args.command, args.candidates, args.days, args.seed))


if __name__ == "__main__":
    main()
