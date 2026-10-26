"""Candidates against job-related criteria the recruiter chose: a shortlist they make themselves.

"The top 10 for the ML Engineer role" means the applicants whose applications show the most of the
criteria the recruiter picked (or, without any, the job's own listed requirements), and each result
says which ones and where: the candidate's listed skills, their headline or their résumé. Years of
relevant experience the application states are quoted alongside. Nothing else is read: never
demographics, pronouns, portal activity, engagement or anything else a person could be judged by,
and there is no score. Nobody is rejected or moved: candidates who show none of the criteria simply
aren't in this list, and stay in the pipeline as before. The recruiter decides who to contact.
"""

import re
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.models import Application, Candidate, CandidateResume, Job
from app.models.base import utcnow
from app.schemas.matching import (
    CandidateMatch,
    EvidenceSource,
    ExperienceNote,
    InterviewState,
    MatchEvidence,
    MatchFilter,
    MatchRequest,
    MatchResult,
)
from app.services.ai.context import parse_requirements
from app.services.communication.health import assess
from app.services.communication.rules import load_rules
from app.services.pipeline_service import load_snapshots
from app.services.snapshot import ApplicationSnapshot

ORDER = "Most of your criteria first, then the earliest applications. No scores."
INTERVIEW_LABELS: dict[InterviewState, str] = {
    "upcoming": "Interview booked",
    "interviewed": "Interviewed",
    "awaiting_update": "Interviewed, no update since",
    "none": "No interview yet",
}
COMMUNICATION_LABELS = {
    "needs_attention": "Needs an update",
    "due_soon": "Update due within a day",
    "on_track": "On track",
}
SENIORITY = re.compile(r"^(?:senior|sr\.?|junior|jr\.?|lead|staff|principal|mid[- ]level|head of)\s+", re.IGNORECASE)
# "Product Designer" is product design experience; "ML Engineer", ML engineering.
TOPICS = {
    "designer": "design",
    "engineer": "engineering",
    "scientist": "science",
    "manager": "management",
    "researcher": "research",
    "developer": "development",
    "analyst": "analysis",
    "recruiter": "recruiting",
}
YEARS = re.compile(r"\b(\d{1,2})\+?\s*(?:years?|yrs?)\b", re.IGNORECASE)
SENTENCE = re.compile(r"(?<=[.!?;])\s+|\n+")


async def match(session: AsyncSession, request: MatchRequest, now: datetime | None = None) -> MatchResult:
    now = now or utcnow()
    query = (
        select(Application)
        .join(Application.candidate)
        .join(Application.job)
        .options(contains_eager(Application.candidate), contains_eager(Application.job))
        .where(Application.archived_at.is_(None))
        .order_by(Application.applied_at, Application.id)
    )
    if request.job_ids:
        query = query.where(Application.job_id.in_(request.job_ids))
    if request.stage is not None:
        query = query.where(Application.stage == request.stage)
    if request.application_ids is not None:
        query = query.where(Application.id.in_(request.application_ids))
    applications = list((await session.scalars(query)).unique())

    filters = await _describe(session, request)
    if request.location:
        place = request.location.casefold()
        applications = [app for app in applications if place in (app.candidate.location or "").casefold()]
    if request.messaging is not None:
        applications = [app for app in applications if app.candidate_messaging_enabled == request.messaging]
    if request.interview is not None or request.communication is not None:
        applications = await _by_progress(session, applications, request, now)

    criteria, source = request.skills, "recruiter"
    if not criteria and request.job_ids:
        jobs = await session.scalars(select(Job).where(Job.id.in_(request.job_ids)))
        criteria = list(dict.fromkeys(item for job in jobs for item in parse_requirements(job.description)))
        source = "job_requirements"
    if not criteria:
        source = "none"

    resumes = await _resume_texts(session, {app.candidate_id for app in applications})
    found = [_match(app, criteria, resumes.get(app.candidate_id)) for app in applications]
    matching = [item for item in found if item.matched] if criteria else found
    matching.sort(key=lambda item: (-item.matched, item.applied_at, item.name))
    return MatchResult(
        criteria=criteria,
        criteria_source=source,  # type: ignore[arg-type]
        filters=filters,
        considered=len(applications),
        matching=len(matching),
        limit=request.limit,
        items=matching[: request.limit],
        order=ORDER,
    )


def _match(application: Application, criteria: list[str], resume: str | None) -> CandidateMatch:
    candidate: Candidate = application.candidate
    evidence = [_evidence(term, candidate, resume) for term in criteria]
    return CandidateMatch(
        application_id=application.id,
        candidate_id=candidate.id,
        name=candidate.full_name,
        job_id=application.job_id,
        job_title=application.job.title,
        company_name=application.job.company.name,
        stage=application.stage,
        location=candidate.location,
        applied_at=application.applied_at,
        matched=sum(1 for item in evidence if item.matched),
        evidence=evidence,
        experience=experience(application.job.title, candidate.headline, resume),
    )


def _norm(text: str) -> str:
    return " ".join(text.casefold().replace("-", " ").split())


def _mentions(text: str | None, term: str) -> bool:
    if not text:
        return False
    words = _norm(term).split()
    if not words:
        return False
    # Singular or plural: "design system" and "design systems" are the same thing.
    last = words[-1][:-1] if len(words[-1]) > 3 and words[-1].endswith("s") else words[-1]
    pattern = r"[\s-]+".join([*map(re.escape, words[:-1]), re.escape(last)])
    return re.search(rf"(?<![\w]){pattern}(?:e?s)?(?![\w])", text.casefold()) is not None


def _evidence(term: str, candidate: Candidate, resume: str | None) -> MatchEvidence:
    """Where the application shows the criterion: a listed skill first, then the headline, then the résumé."""
    wanted = _norm(term)
    source: EvidenceSource | None = None
    if any(_norm(skill) == wanted or _mentions(skill, term) for skill in candidate.skills or []):
        source = "skills"
    elif _mentions(candidate.headline, term):
        source = "headline"
    elif _mentions(resume, term):
        source = "resume"
    return MatchEvidence(criterion=term, matched=source is not None, source=source)


def experience(job_title: str, headline: str | None, resume: str | None) -> ExperienceNote | None:
    """Years of experience the application states in a sentence about this kind of work, quoted as written."""
    words = SENIORITY.sub("", job_title.strip()).split()
    stems = {word.casefold()[:5] for word in words if len(word) >= 4} | {
        word.casefold() for word in words if word.isupper()
    }
    if not stems:
        return None
    topic = " ".join(word if word.isupper() else TOPICS.get(word.casefold(), word.casefold()) for word in words)
    for source, text in (("headline", headline), ("resume", resume)):
        for sentence in SENTENCE.split(text or ""):
            years = YEARS.search(sentence)
            lowered = sentence.casefold()
            if years and any(re.search(rf"\b{re.escape(stem)}", lowered) for stem in stems):
                count = int(years.group(1))
                return ExperienceNote(
                    label=f"{count} year{'' if count == 1 else 's'} {topic} experience",
                    source=source,  # type: ignore[arg-type]
                    quote=sentence.strip()[:200],
                )
    return None


async def _resume_texts(session: AsyncSession, candidate_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Each candidate's latest résumé text, where there is one."""
    if not candidate_ids:
        return {}
    rows = await session.execute(
        select(CandidateResume.candidate_id, CandidateResume.text)
        .where(CandidateResume.candidate_id.in_(candidate_ids), CandidateResume.text.is_not(None))
        .order_by(CandidateResume.created_at.desc())
    )
    texts: dict[uuid.UUID, str] = {}
    for candidate_id, text in rows.all():
        texts.setdefault(candidate_id, text)
    return texts


def interview_state(
    snapshot: ApplicationSnapshot, last_update_at: datetime | None, now: datetime
) -> set[InterviewState]:
    states: set[InterviewState] = set()
    held = snapshot.last_interview(now)
    if snapshot.upcoming_interview(now) is not None:
        states.add("upcoming")
    if held is not None:
        states.add("interviewed")
        if last_update_at is None or last_update_at < held.scheduled_at:
            states.add("awaiting_update")
    if not states:
        states.add("none")
    return states


async def _by_progress(
    session: AsyncSession, applications: list[Application], request: MatchRequest, now: datetime
) -> list[Application]:
    rules = await load_rules(session)
    kept = []
    for snapshot in await load_snapshots(session, applications):
        health = assess(snapshot, rules, now)
        if request.communication is not None and health.status != request.communication:
            continue
        if request.interview is not None and request.interview not in interview_state(
            snapshot, health.last_update_at, now
        ):
            continue
        kept.append(snapshot.application)
    return kept


async def _describe(session: AsyncSession, request: MatchRequest) -> list[MatchFilter]:
    """Every filter in force, in the recruiter's words, so nothing is applied out of sight."""
    filters: list[MatchFilter] = []
    if request.job_ids:
        jobs = list(await session.scalars(select(Job).where(Job.id.in_(request.job_ids)).order_by(Job.title)))
        filters += [MatchFilter(key=f"job:{job.id}", label=f"Job: {job.title} · {job.company.name}") for job in jobs]
    if request.stage is not None:
        filters.append(MatchFilter(key="stage", label=f"Stage: {request.stage.label}"))
    if request.location:
        filters.append(MatchFilter(key="location", label=f"Location: {request.location}"))
    if request.interview is not None:
        filters.append(MatchFilter(key="interview", label=INTERVIEW_LABELS[request.interview]))
    if request.communication is not None:
        filters.append(
            MatchFilter(
                key="communication", label=COMMUNICATION_LABELS.get(request.communication, request.communication)
            )
        )
    if request.messaging is not None:
        filters.append(MatchFilter(key="messaging", label="Can message you" if request.messaging else "Messaging off"))
    if request.application_ids is not None:
        filters.append(MatchFilter(key="in_view", label=f"The {len(request.application_ids)} candidates in view"))
    return filters
