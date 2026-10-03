"""What the candidate assistant knows: the candidate's own record, as the portal shows it.

This is deliberately not the recruiter's CandidateContext. It is built from the portal
projections (services/candidate_ai_service.py), so interviewer feedback, engagement, AI analysis,
follow-up reasons, stage-change reasons and other candidates can't reach a prompt or an answer.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.enums import InterviewStatus
from app.services.ai.context import people

FORMATS = {"video": "video", "phone": "phone", "onsite": "on-site"}


@dataclass(frozen=True)
class PortalInterviewFact:
    title: str
    interview_type: str
    scheduled_at: datetime
    duration_minutes: int
    interviewers: tuple[str, ...]
    status: InterviewStatus
    upcoming: bool
    confirmed: bool
    can_confirm: bool

    @property
    def format(self) -> str:
        """'60-minute video interview with Maya Okafor and Leo Brandt'."""
        kind = FORMATS.get(self.interview_type, self.interview_type)
        with_whom = f" with {people(self.interviewers)}" if self.interviewers else ""
        return f"{self.duration_minutes}-minute {kind} interview{with_whom}"


@dataclass(frozen=True)
class PortalContext:
    first_name: str
    location: str | None
    headline: str | None
    skills: tuple[str, ...]
    company: str
    company_overview: str
    job_title: str
    job_department: str | None
    job_location: str | None
    employment_type: str
    hiring_manager: str | None
    job_summary: str | None
    job_requirements: tuple[str, ...]  # as listed in the public job posting
    stage_label: str
    status: str  # active | hired | closed
    next_step: str
    interviews: tuple[PortalInterviewFact, ...]  # by scheduled time
    activity: tuple[str, ...]  # candidate-visible titles, newest first
    messages: tuple[tuple[str, str], ...]  # (sender, content), oldest first
    recruiter_name: str | None
    now: datetime
    utc_offset_minutes: int | None = None  # the candidate's time zone, when the browser sent it

    @property
    def next_interview(self) -> PortalInterviewFact | None:
        return next((i for i in self.interviews if i.upcoming), None)

    @property
    def past_interviews(self) -> list[PortalInterviewFact]:
        return [i for i in self.interviews if not i.upcoming and i.status != InterviewStatus.CANCELLED]

    @property
    def recruiter(self) -> str:
        """The recruiter's first name, for answers ("Alex"), or a neutral stand-in."""
        return self.recruiter_name.split()[0] if self.recruiter_name else "your recruiter"

    @property
    def company_facts(self) -> list[str]:
        """Company-approved information: the configured overview and the job posting, nothing else."""
        facts = [self.company_overview] if self.company_overview else []
        team = f"The {self.job_title} role is part of the {self.job_department} team" if self.job_department else None
        if team:
            facts.append(f"{team}, based in {self.job_location}." if self.job_location else f"{team}.")
        facts.append(f"It's a {self.employment_type.lower()} position.")
        if self.hiring_manager:
            facts.append(f"The hiring manager is {self.hiring_manager}.")
        if self.job_summary:
            facts.append(f"About the role: {self.job_summary}")
        return facts

    def when(self, at: datetime) -> str:
        """'tomorrow at 10:00' in the candidate's time zone, or 'tomorrow at 09:00 UTC' without one."""
        offset = timedelta(minutes=self.utc_offset_minutes or 0)
        local, today = at + offset, self.now + offset
        days = (local.date() - today.date()).days
        time = f"{local:%H:%M}" + ("" if self.utc_offset_minutes is not None else " UTC")
        if days == 0:
            return f"today at {time}"
        if days == 1:
            return f"tomorrow at {time}"
        if days == -1:
            return f"yesterday at {time}"
        return f"on {local:%A} {local.day} {local:%B} at {time}"

    def to_prompt(self) -> str:
        """The context as labelled sections, the format the LLM providers send."""
        role = self.job_title + (f" ({self.job_department} team)" if self.job_department else "")
        lines = [
            "[candidate]",
            f"First name: {self.first_name}",
            f"Location: {self.location or 'not given'}",
            f"Headline: {self.headline or 'none'}",
            f"Skills: {', '.join(self.skills) or 'none listed'}",
            "",
            "[role]",
            f"Company: {self.company}",
            f"Role: {role}. Location: {self.job_location or 'not given'}. Type: {self.employment_type}.",
            f"About the role: {self.job_summary or 'not given'}",
            f"Skills listed in the job posting: {', '.join(self.job_requirements) or 'none listed'}",
            "",
            "[company] approved facts you may share",
            *(f"- {fact}" for fact in self.company_facts),
            "",
            "[application]",
            "Hiring process: Applied, Screening, Interview, Offer, Hired.",
            f"Current stage: {self.stage_label}. Status: {self.status}.",
            f"Next step: {self.next_step}",
            "",
            "[interviews]",
            *(_interview_line(self, i) for i in self.interviews),
            "",
            "[recent activity] newest first",
            *(f"- {title}" for title in self.activity[:10]),
            "",
            "[messages with the hiring team] oldest first",
            *(f"- {sender}: {content}" for sender, content in self.messages[-8:]),
            "",
            f"Recruiter: {self.recruiter_name or 'not assigned'}. Current time: {self.when(self.now)}.",
        ]
        return "\n".join(lines)


def _interview_line(context: PortalContext, interview: PortalInterviewFact) -> str:
    if interview.status == InterviewStatus.CANCELLED:
        state = "cancelled"
    elif interview.upcoming:
        state = "upcoming, confirmed" if interview.confirmed else "upcoming, not confirmed yet"
    else:
        state = "done"
    return f"- {interview.title}: {interview.format}, {context.when(interview.scheduled_at)} ({state})."


def lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text
