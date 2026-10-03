"""Load the demo pipeline.

    python -m app.db.seed                            load into an empty database (DATABASE_URL)
    python -m app.db.seed --reset                    replace everything with the demo data
    python -m app.db.seed --sql ../supabase/seed.sql write it as SQL for the Supabase CLI

Ids are deterministic and times are relative to now, so every load looks the same and current.
"""

import argparse
import asyncio
import json
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType, ApplicationStage, InterviewStatus, InterviewType, SenderType, UserRole
from app.db.seed_data import CANDIDATES, DAY, INTERVIEWS, JOBS, RECRUITER, THREADS, CandidateSeed
from app.models import (
    AIAnalysis,
    Application,
    Base,
    Candidate,
    CandidateActivity,
    CandidateStageHistory,
    Interview,
    Job,
    Message,
    User,
)
from app.models.base import utcnow

NAMESPACE = uuid.UUID("6f1c0d1e-7a51-4c1e-9b8a-5e1d2c3b4a10")
PIPELINE = [
    ApplicationStage.SOURCED,
    ApplicationStage.SCREENING,
    ApplicationStage.INTERVIEW,
    ApplicationStage.OFFER,
    ApplicationStage.HIRED,
]
TABLES: list[type[Base]] = [
    User,
    Job,
    Candidate,
    Application,
    CandidateStageHistory,
    Interview,
    Message,
    CandidateActivity,
]


@dataclass(frozen=True)
class Ago:
    minutes: int


@dataclass(frozen=True)
class OnDay:
    days: int
    at: str  # HH:MM UTC


def seed_id(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{key}")


def email_for(first: str, last: str) -> str:
    ascii_name = unicodedata.normalize("NFD", f"{first} {last}").encode("ascii", "ignore").decode()
    local = ".".join(part for part in "".join(c if c.isalpha() else " " for c in ascii_name.lower()).split())
    return f"{local}@example.com"


@dataclass
class Recorder:
    """Appends rows for one application with deterministic ids."""

    rows: list[dict[str, Any]]
    kind: str
    key: str
    application_id: uuid.UUID

    def add(self, **values: Any) -> None:
        row_id = seed_id(self.kind, f"{self.key}:{len(self.rows)}")
        self.rows.append({"id": row_id, "application_id": self.application_id, **values})

    def add_event(self, kind: ActivityType, title: str, minutes: int, metadata: dict[str, Any] | None = None) -> None:
        self.add(activity_type=kind.value, title=title, description=None, metadata=metadata, created_at=Ago(minutes))


def build_seed() -> dict[type[Base], list[dict[str, Any]]]:
    rows: dict[type[Base], list[dict[str, Any]]] = {table: [] for table in TABLES}
    recruiter_id = seed_id("user", RECRUITER["email"])
    rows[User].append(
        {
            "id": recruiter_id,
            "email": RECRUITER["email"],
            "full_name": RECRUITER["full_name"],
            "role": UserRole.RECRUITER,
            "created_at": Ago(120 * DAY),
            "updated_at": Ago(120 * DAY),
        }
    )

    job_ids: dict[str, uuid.UUID] = {}
    for job in JOBS:
        job_ids[job.title] = seed_id("job", job.title)
        rows[Job].append(
            {
                "id": job_ids[job.title],
                "external_id": None,
                "title": job.title,
                "department": job.department,
                "location": job.location,
                "description": job.description,
                "status": job.status,
                "employment_type": "Full-time",
                "hiring_manager": job.hiring_manager,
                "created_at": Ago(job.opened_days_ago * DAY),
                "updated_at": Ago(job.opened_days_ago * DAY),
            }
        )

    application_ids: dict[str, uuid.UUID] = {}
    confirmations: dict[str, int] = {}
    for seed in CANDIDATES:
        candidate_id = seed_id("candidate", seed.key)
        application_id = application_ids[seed.key] = seed_id("application", seed.key)
        added = seed.added_minutes_ago
        latest = min((event.minutes_ago for event in seed.events), default=added)
        confirmations[seed.key] = next(
            (e.minutes_ago for e in seed.events if e.type == ActivityType.INTERVIEW_CONFIRMED), DAY
        )
        rows[Candidate].append(
            {
                "id": candidate_id,
                "external_id": None,
                "first_name": seed.first_name,
                "last_name": seed.last_name,
                "email": email_for(seed.first_name, seed.last_name),
                "phone": seed.phone,
                "location": seed.location,
                "avatar_url": None,
                "headline": seed.headline,
                "resume_url": None,
                "pronouns": seed.pronouns,
                "skills": list(seed.skills),
                "created_at": Ago(added),
                "updated_at": Ago(added),
            }
        )
        rows[Application].append(
            {
                "id": application_id,
                "candidate_id": candidate_id,
                "job_id": job_ids[seed.job],
                "stage": seed.stage,
                "source": seed.source,
                "applied_at": Ago(added),
                "updated_at": Ago(latest),
                "archived_at": None,
            }
        )

        history = Recorder(rows[CandidateStageHistory], "history", seed.key, application_id)
        activity = Recorder(rows[CandidateActivity], "activity", seed.key, application_id)
        history.add(
            previous_stage=None, new_stage=ApplicationStage.SOURCED, changed_by=recruiter_id, changed_at=Ago(added)
        )
        activity.add_event(ActivityType.APPLICATION_CREATED, seed.created_title, added, {"source": seed.source})
        previous = ApplicationStage.SOURCED
        for stage, minutes in zip(PIPELINE[1 : PIPELINE.index(seed.stage) + 1], _moves(seed, latest), strict=True):
            history.add(previous_stage=previous, new_stage=stage, changed_by=recruiter_id, changed_at=Ago(minutes))
            activity.add_event(
                ActivityType.STAGE_CHANGED, f"Moved to {stage.label}", minutes, {"from": previous, "to": stage}
            )
            previous = stage
        for event in seed.events:
            activity.add_event(event.type, event.title, event.minutes_ago)

    for interview in INTERVIEWS:
        past = interview.days < 0
        rows[Interview].append(
            {
                "id": seed_id("interview", f"{interview.candidate}:{interview.title}"),
                "application_id": application_ids[interview.candidate],
                "title": interview.title,
                "interview_type": interview.interview_type,
                "scheduled_at": OnDay(interview.days, interview.at),
                "duration_minutes": interview.duration_minutes,
                "status": interview.status,
                "meeting_url": (
                    f"https://meet.example.com/{interview.candidate}"
                    if interview.interview_type == InterviewType.VIDEO and interview.status != InterviewStatus.COMPLETED
                    else None
                ),
                "notes": interview.notes,
                "interviewers": list(interview.interviewers),
                "confirmed_at": (
                    (Ago((2 - interview.days) * DAY) if past else Ago(confirmations[interview.candidate]))
                    if interview.confirmed
                    else None
                ),
                "created_at": Ago((7 - interview.days) * DAY if past else 3 * DAY),
                "updated_at": Ago(-interview.days * DAY if past else 3 * DAY),
            }
        )

    for thread in THREADS:
        from_candidate = [m for m in thread.messages if m.sender == SenderType.CANDIDATE]
        unread = {id(m) for m in from_candidate[len(from_candidate) - thread.unread :]} if thread.unread else set()
        for index, message in enumerate(thread.messages):
            is_candidate = message.sender == SenderType.CANDIDATE
            # The candidate read a recruiter message by the time they replied to it.
            reply = next((m for m in thread.messages[index + 1 :] if m.sender == SenderType.CANDIDATE), None)
            if is_candidate:
                read_at = Ago(max(message.minutes_ago - 30, 0)) if id(message) not in unread else None
            else:
                read_at = Ago(reply.minutes_ago) if reply else None
            rows[Message].append(
                {
                    "id": seed_id("message", f"{thread.candidate}:{index}"),
                    "application_id": application_ids[thread.candidate],
                    "sender_type": message.sender,
                    "content": message.content,
                    "created_at": Ago(message.minutes_ago),
                    "read_at": read_at,
                }
            )
    return rows


def _moves(seed: CandidateSeed, latest: int) -> list[int]:
    """Minutes ago for each stage move: as given, or spread between joining and the latest event."""
    count = PIPELINE.index(seed.stage)
    if seed.moves is not None:
        return list(seed.moves)
    span = seed.added_minutes_ago - latest
    return [round(seed.added_minutes_ago - span * (i + 1) / (count + 1)) for i in range(count)]


def resolve(value: Any, now: datetime) -> Any:
    if isinstance(value, Ago):
        return now - timedelta(minutes=value.minutes)
    if isinstance(value, OnDay):
        # Wall-clock time in the server's time zone, so a local demo shows interviews at 10:00, not
        # 10:00 UTC. A server running in UTC (as hosted ones do) keeps UTC.
        hours, minutes = (int(part) for part in value.at.split(":"))
        midnight = now.astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        return (midnight + timedelta(days=value.days, hours=hours, minutes=minutes)).astimezone(UTC)
    return value


async def load_seed(session: AsyncSession, now: datetime | None = None) -> None:
    now = now or utcnow()
    for table, items in build_seed().items():
        await session.execute(
            insert(table.__table__), [{key: resolve(value, now) for key, value in row.items()} for row in items]
        )
    await session.commit()


async def seed_if_empty(session: AsyncSession) -> bool:
    """Load the demo data unless the database already has jobs. Returns whether it loaded."""
    if await session.scalar(select(func.count()).select_from(Job)):
        return False
    await load_seed(session)
    return True


async def reset_and_seed(session: AsyncSession) -> None:
    for table in [AIAnalysis, *reversed(TABLES)]:
        await session.execute(delete(table))
    await load_seed(session)


# SQL output for supabase/seed.sql


def render_sql() -> str:
    lines = [
        "-- Talent Bridge demo data: the recruiter dashboard's candidates, jobs, interviews and threads.",
        "-- Generated by `python -m app.db.seed --sql ../supabase/seed.sql` from backend/app/db/seed_data.py.",
        "-- Edit the Python data and regenerate rather than editing this file.",
        "-- Times are relative to now(), so the demo always looks current.",
        "",
        "begin;",
        "",
    ]
    for table, items in build_seed().items():
        columns = list(items[0])
        lines.append(f"insert into public.{table.__tablename__} ({', '.join(columns)}) values")
        values = [f"  ({', '.join(_literal(row[column]) for column in columns)})" for row in items]
        lines.append(",\n".join(values) + ";")
        lines.append("")
    lines.append("commit;")
    return "\n".join(lines) + "\n"


def _literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, Ago):
        return f"now() - interval '{value.minutes} minutes'"
    if isinstance(value, OnDay):
        hours, minutes = value.at.split(":")
        return f"date_trunc('day', now()) + interval '{value.days} days {int(hours)} hours {int(minutes)} minutes'"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list | dict):
        return f"{_quote(json.dumps(value, ensure_ascii=False))}::jsonb"
    if isinstance(value, StrEnum | uuid.UUID | str):
        return _quote(str(value))
    raise TypeError(f"Can't write {value!r} as SQL")


def _quote(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


async def _seed_database(reset: bool) -> None:
    from app.core.database import create_tables, dispose_engine, get_engine, get_sessionmaker

    engine = get_engine()
    if engine.dialect.name == "sqlite":
        await create_tables(engine)
    async with get_sessionmaker()() as session:
        if reset:
            await reset_and_seed(session)
            print(f"Replaced the data in {engine.url.render_as_string(hide_password=True)} with the demo pipeline.")
        elif await seed_if_empty(session):
            print(f"Loaded the demo pipeline into {engine.url.render_as_string(hide_password=True)}.")
        else:
            print("The database already has data, so nothing was loaded. Use --reset to replace it.")
    await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load the Talent Bridge demo pipeline.")
    parser.add_argument("--reset", action="store_true", help="delete all existing data first")
    parser.add_argument("--sql", type=Path, metavar="FILE", help="write the seed as SQL to FILE instead")
    args = parser.parse_args()
    if args.sql:
        args.sql.write_text(render_sql(), encoding="utf-8")
        print(f"Wrote {args.sql}")
        return
    asyncio.run(_seed_database(args.reset))


if __name__ == "__main__":
    main()
