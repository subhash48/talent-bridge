"""What the recruiter AI knows about one application, and where each fact came from.

Providers only ever see a CandidateContext, so the model's knowledge is explicit and every answer
can cite its sources. Contact details are left out on purpose: no answer needs them.

Candidate engagement (services/engagement) is deliberately not part of it: portal visits, time spent
and response speed say nothing about whether someone can do the job, so they can never reach an
analysis, a strength, a concern or anything else the AI writes.
"""

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType, ApplicationStage, InterviewStatus, SenderType
from app.schemas.ai import AISource

SECTIONS = ("profile", "job", "activity", "interviews", "messages")

_REQUIREMENTS = re.compile(
    r"^\s*(?:requirements|what you[’']?ll bring|skills)\s*:\s*(.+)$", re.IGNORECASE | re.MULTILINE
)


@dataclass(frozen=True)
class ActivityFact:
    type: str
    title: str
    description: str | None
    at: datetime


@dataclass(frozen=True)
class InterviewFact:
    title: str
    interview_type: str
    scheduled_at: datetime
    duration_minutes: int
    status: InterviewStatus
    interviewers: tuple[str, ...]
    notes: str | None
    confirmed: bool


@dataclass(frozen=True)
class MessageFact:
    sender: SenderType
    content: str
    at: datetime


@dataclass(frozen=True)
class CandidateContext:
    application_id: uuid.UUID
    candidate_id: uuid.UUID
    job_id: uuid.UUID
    name: str
    first_name: str
    pronouns: str | None
    location: str | None
    headline: str | None
    skills: tuple[str, ...]
    job_title: str
    job_department: str | None
    job_description: str | None
    job_requirements: tuple[str, ...]
    stage: ApplicationStage
    source: str | None
    applied_at: datetime
    follow_up_reason: str | None  # what the recruiter owes the candidate (next_actions), not engagement
    activities: tuple[ActivityFact, ...]  # newest first
    interviews: tuple[InterviewFact, ...]  # by scheduled time
    messages: tuple[MessageFact, ...]  # oldest first
    recruiter_name: str
    organization: str
    now: datetime

    @property
    def their(self) -> str:
        subject = (self.pronouns or "").split("/")[0].strip().lower()
        return {"she": "her", "he": "his"}.get(subject, "their")

    @property
    def recruiter_first_name(self) -> str:
        return self.recruiter_name.split()[0] if self.recruiter_name else "The recruiting team"

    @property
    def upcoming_interview(self) -> InterviewFact | None:
        return next(
            (i for i in self.interviews if i.status == InterviewStatus.SCHEDULED and i.scheduled_at > self.now),
            None,
        )

    @property
    def completed_interviews(self) -> list[InterviewFact]:
        return [i for i in reversed(self.interviews) if i.status == InterviewStatus.COMPLETED]

    @property
    def candidate_questions(self) -> list[ActivityFact]:
        return [a for a in self.activities if a.type == ActivityType.QUESTION_ASKED]

    @property
    def last_message(self) -> MessageFact | None:
        return self.messages[-1] if self.messages else None

    def sources(self, *sections: str) -> list[AISource]:
        """Source chips for the sections an answer used. Empty sections are left out."""
        available = {
            "profile": (str(self.candidate_id), "Profile"),
            "job": (str(self.job_id), f"Job: {self.job_title}"),
            "activity": (str(self.application_id), "Activity timeline") if self.activities else None,
            "interviews": (str(self.application_id), "Interview schedule") if self.interviews else None,
            "messages": (str(self.application_id), "Message thread") if self.messages else None,
        }
        chips = []
        for section in dict.fromkeys(sections):
            entry = available.get(section)
            if entry:
                chips.append(AISource(type=section, id=entry[0], label=entry[1]))
        return chips

    def to_prompt(self) -> str:
        """The context as labelled sections, the format the LLM providers send."""
        lines = [
            "[profile]",
            f"Name: {self.name}" + (f" ({self.pronouns})" if self.pronouns else ""),
            f"Location: {self.location or 'unknown'}",
            f"Headline: {self.headline or 'none'}",
            f"Skills: {', '.join(self.skills) or 'none listed'}",
            "",
            "[job]",
            f"Role: {self.job_title}" + (f" ({self.job_department})" if self.job_department else ""),
            f"Description: {self.job_description or 'none'}",
            f"Requirements: {', '.join(self.job_requirements) or 'none listed'}",
            "",
            "[application]",
            f"Stage: {self.stage.label}. Source: {self.source or 'unknown'}. Applied {ago(self.applied_at, self.now)}.",
            f"Needs follow-up: {self.follow_up_reason or 'no'}",
            "",
            "[activity] newest first",
            *(
                f"- {ago(a.at, self.now)}: {a.title}" + (f" ({a.description})" if a.description else "")
                for a in self.activities[:25]
            ),
            "",
            "[interviews]",
            *(_interview_line(i, self.now) for i in self.interviews),
            "",
            "[messages] oldest first",
            *(f"- {m.sender.value}, {ago(m.at, self.now)}: {m.content}" for m in self.messages[-12:]),
            "",
            (
                f"Recruiter: {self.recruiter_name}. Company: {self.organization}. "
                f"Current time: {self.now:%Y-%m-%d %H:%M} UTC."
            ),
        ]
        return "\n".join(lines)


def _interview_line(interview: InterviewFact, now: datetime) -> str:
    status = interview.status.value + (", confirmed" if interview.confirmed else "")
    feedback = f' Feedback: "{interview.notes}"' if interview.notes else ""
    with_whom = f" with {people(interview.interviewers)}" if interview.interviewers else ""
    return (
        f"- {interview.title}, {interview.interview_type}, {when(interview.scheduled_at, now)}, "
        f"{interview.duration_minutes} min{with_whom} ({status}).{feedback}"
    )


def parse_requirements(description: str | None) -> tuple[str, ...]:
    """Requirements from a "Requirements: a, b, c" line in the job description."""
    match = _REQUIREMENTS.search(description or "")
    if not match:
        return ()
    parts = (part.strip(" .") for part in re.split(r"[,;]", match.group(1)))
    return tuple(dict.fromkeys(part for part in parts if part))


def when(at: datetime, now: datetime) -> str:
    """'today at 10:00 UTC', 'tomorrow at 14:30 UTC', 'on Tue 6 Oct at 10:00 UTC'."""
    days = (at.date() - now.date()).days
    time = f"{at:%H:%M} UTC"
    if days == 0:
        return f"today at {time}"
    if days == 1:
        return f"tomorrow at {time}"
    if days == -1:
        return f"yesterday at {time}"
    return f"on {at:%a} {at.day} {at:%b} at {time}"


def ago(at: datetime, now: datetime) -> str:
    seconds = (now - at).total_seconds()
    if seconds < 60:
        return "just now"
    for size, unit in ((86400, "day"), (3600, "hour"), (60, "minute")):
        if seconds >= size:
            count = int(seconds // size)
            return f"{count} {unit}{'' if count == 1 else 's'} ago"
    return "just now"


def people(names: Sequence[str]) -> str:
    if not names:
        return "the team"
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


async def build_candidate_context(
    session: AsyncSession,
    application_id: uuid.UUID,
    *,
    recruiter_name: str,
    organization: str,
    now: datetime,
) -> CandidateContext:
    from app.services.candidate_service import get_candidate_detail
    from app.services.pipeline_service import get_application

    application = await get_application(session, application_id)
    detail = await get_candidate_detail(session, application.candidate_id, application.id, now=now)
    assert detail.job is not None and detail.stage is not None
    candidate = detail.candidate
    return CandidateContext(
        application_id=application.id,
        candidate_id=candidate.id,
        job_id=detail.job.id,
        name=candidate.full_name,
        first_name=candidate.first_name,
        pronouns=candidate.pronouns,
        location=candidate.location,
        headline=candidate.headline,
        skills=tuple(candidate.skills),
        job_title=detail.job.title,
        job_department=detail.job.department,
        job_description=detail.job.description,
        job_requirements=parse_requirements(detail.job.description),
        stage=detail.stage,
        source=application.source,
        applied_at=application.applied_at,
        follow_up_reason=detail.engagement.follow_up_reason if detail.engagement else None,
        activities=tuple(ActivityFact(a.activity_type, a.title, a.description, a.created_at) for a in detail.activity),
        interviews=tuple(
            InterviewFact(
                title=i.title,
                interview_type=i.interview_type.value,
                scheduled_at=i.scheduled_at,
                duration_minutes=i.duration_minutes,
                status=i.status,
                interviewers=tuple(i.interviewers),
                notes=i.notes,
                confirmed=i.confirmed_at is not None,
            )
            for i in detail.interviews
        ),
        messages=tuple(MessageFact(m.sender_type, m.content, m.created_at) for m in detail.messages),
        recruiter_name=recruiter_name,
        organization=organization,
        now=now,
    )
