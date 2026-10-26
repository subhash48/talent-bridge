"""Finding and picking candidates through the assistant, with every filter on screen.

"Show applicants for the ML Engineer job", "only those with Python, PyTorch and AWS", "show 10" each
become visible filters and criteria (SearchState, sent back with the next request so the list narrows
as the conversation goes), run by the same matching as the Candidates page (candidate_matching), and
come back as a list with each candidate's evidence and a link to the same view there. "Select Sophia,
Maya and James" ticks those candidates in that list. The assistant never picks anyone itself.
"""

import re
import uuid
from urllib.parse import urlencode

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus
from app.schemas.assistant import AssistantContext, AssistantIntent, CandidateMatchCard, SearchState
from app.schemas.matching import MatchRequest, MatchResult
from app.services import candidate_matching
from app.services.assistant.jobs import skill_names
from app.services.assistant.resolve import active_applications, find_jobs, normalize

LIST = "|"
# "that role", "this job", "it": the job the conversation is about.
THAT_JOB = re.compile(r"^(?:that|this|the same|it|the new)(?:\s+(?:one|role|job|position))?$", re.IGNORECASE)
EVERYONE = re.compile(
    r"\b(all|every|everyone|any)\s+(candidates?|applicants?|jobs|roles)\b|\bacross all\b|\bstart over\b", re.IGNORECASE
)


class JobNotFound(Exception):
    def __init__(self, title: str) -> None:
        self.title = title


async def state_for(
    session: AsyncSession, intent: AssistantIntent, text: str, context: AssistantContext
) -> SearchState:
    """The filters a search request means, given the list already on screen: what it says replaces
    what was there, and the rest is kept, unless it names another job or asks for everyone."""
    previous = context.search or SearchState()
    keep = not EVERYONE.search(text)
    job_ids = list(previous.job_ids) if keep else []
    named_job = intent.job_title.strip() if intent.job_title else None
    if named_job and THAT_JOB.match(named_job):
        named_job = None
        job_ids = [context.job_id] if context.job_id else job_ids
    if named_job:
        jobs = await find_jobs(session, named_job)
        if not jobs:
            raise JobNotFound(named_job)
        # "Product Designer" is the job called that, rather than "Senior Product Designer" too, and an open
        # one rather than a draft; the chips show exactly which, and the recruiter can change them.
        exact = [job for job in jobs if normalize(job.title) == normalize(named_job)] or jobs
        jobs = [job for job in exact if job.status == JobStatus.OPEN] or exact
        if [job.id for job in jobs] != job_ids:
            previous, job_ids = SearchState(), [job.id for job in jobs]  # another job: its own list
    elif not keep:
        previous = SearchState()
    return SearchState(
        job_ids=job_ids[:20],
        skills=skill_names(intent.skills, keep_experience=True) or previous.skills,
        stage=intent.stage or previous.stage,
        location=intent.location or previous.location,
        interview=intent.interview_state or previous.interview,
        communication=intent.communication or previous.communication,
        available_days=intent.available_days or previous.available_days,
        limit=intent.limit or previous.limit,
    )


async def run(session: AsyncSession, state: SearchState, selected: list[uuid.UUID]) -> CandidateMatchCard:
    result = await candidate_matching.match(
        session,
        MatchRequest(
            job_ids=state.job_ids,
            skills=state.skills,
            stage=state.stage,
            location=state.location,
            interview=state.interview,
            communication=state.communication,
            available_days=state.available_days,
            limit=state.limit,
        ),
    )
    return CandidateMatchCard(
        title=_title(result),
        filters=result.filters,
        criteria=result.criteria,
        available_days=result.available_days,
        criteria_source=result.criteria_source,
        considered=result.considered,
        matching=result.matching,
        limit=result.limit,
        items=result.items,
        order=result.order,
        selected=selected,
        href=href(state),
    )


def reply(card: CandidateMatchCard, *, ranked: bool = False) -> str:
    shown = len(card.items)
    lead = "I don't rank people. " if ranked else ""
    filters = ", ".join(item.label for item in card.filters) or "no filters"
    if card.considered == 0:
        return f"{lead}No active candidates fit these filters ({filters}). Remove one to see more."
    asked = [*card.criteria, *(f"available {day.label}" for day in card.available_days)]
    if asked:
        source = "the job's listed requirements" if card.criteria_source == "job_requirements" else "your criteria"
        text = (
            f"{lead}**{shown} of {card.matching}** candidates showing {source} ({', '.join(asked)}), "
            f"from {card.considered} who fit {filters}. Most criteria first, then the earliest applications; "
            "each one shows why it's there."
        )
    else:
        text = f"{lead}**{shown} of {card.considered}** candidates who fit {filters}, earliest applications first."
    return f'{text} Nothing about anyone has changed: tick who you want, then say what to do, like "Draft interview invitations".'


def href(state: SearchState) -> str:
    """The same list on the Candidates page, with the same filters showing there (lib/candidate-query)."""
    params: dict[str, str] = {}
    if state.job_ids:
        params["job"] = LIST.join(str(job) for job in state.job_ids)
    if state.stage and state.stage.value in {"sourced", "screening", "interview", "offer", "hired"}:
        params["stage"] = state.stage.value
    if state.location:
        params["location"] = state.location
    if state.interview:
        params["interview"] = state.interview
    if state.communication:
        params["communication"] = state.communication.value
    params["shortlist"] = str(state.limit)
    if state.skills:
        params["criteria"] = LIST.join(state.skills)
    return f"/recruiter/candidates?{urlencode(params)}"


def _title(result: MatchResult) -> str:
    jobs = [item.label.removeprefix("Job: ") for item in result.filters if item.key.startswith("job:")]
    if len(jobs) == 1:
        return f"Applicants for {jobs[0]}"
    if jobs:
        return f"Applicants for {len(jobs)} jobs"
    return "Candidates"


async def resolve_names(
    session: AsyncSession, names: list[str], state: SearchState | None
) -> tuple[list[uuid.UUID], list[str], dict[str, list[tuple[uuid.UUID, str]]]]:
    """The applications the names mean: in the list on screen first, else anywhere in the active pipeline.
    Returns the ones found, the names that match nobody, and the names that match several applications
    (each with what tells them apart), for the recruiter to choose. Never a guess."""
    pool: list[tuple[uuid.UUID, str, str]] = []  # application, full name, "job at company"
    if state is not None:
        listed = await candidate_matching.match(
            session,
            MatchRequest(
                job_ids=state.job_ids,
                skills=state.skills,
                stage=state.stage,
                location=state.location,
                interview=state.interview,
                communication=state.communication,
                limit=200,
            ),
        )
        pool = [(item.application_id, item.name, f"{item.job_title} at {item.company_name}") for item in listed.items]
    everyone = [
        (app.id, app.candidate.full_name, f"{app.job.title} at {app.job.company.name}")
        for app in await active_applications(session)
    ]
    found: list[uuid.UUID] = []
    unknown: list[str] = []
    unclear: dict[str, list[tuple[uuid.UUID, str]]] = {}
    for name in names:
        for candidates in (pool, everyone):
            hits = [(app_id, detail) for app_id, full, detail in candidates if _same_person(full, name)]
            if hits:
                break
        if not hits:
            unknown.append(name)
        elif len(hits) == 1:
            found.append(hits[0][0])
        else:
            unclear[name] = hits
    return list(dict.fromkeys(found)), unknown, unclear


def among(names: list[str], people: list[tuple[uuid.UUID, str]]) -> tuple[list[uuid.UUID], list[str]]:
    """The names said, among these people only ("remove James" from the outreach on screen): the ones
    found, and the names that match none of them, or more than one."""
    found: list[uuid.UUID] = []
    missed: list[str] = []
    for name in names:
        hits = [person for person, full in people if _same_person(full, name)]
        if len(hits) == 1:
            found.append(hits[0])
        else:
            missed.append(name)
    return list(dict.fromkeys(found)), missed


def _same_person(full_name: str, said: str) -> bool:
    words = normalize(said).replace("'s", "").split()
    have = normalize(full_name).split()
    return bool(words) and all(word in have for word in words)
