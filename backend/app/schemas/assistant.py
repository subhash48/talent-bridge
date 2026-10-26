"""The recruiter assistant (/assistant/*): one action engine for typed and spoken requests, about
candidate communication: who needs an update, what they're waiting for, and drafts to send; finding
and shortlisting candidates on job-related criteria; personalized outreach and interview invitations
to the candidates the recruiter picked; and drafting a new job.

A request is understood as one AssistantIntent (a structured action), whatever words it used and
whether it was typed or transcribed. The response carries the reply and cards the workspace renders.
External actions (sending, scheduling, creating a job) come back as proposals that only run when the
recruiter confirms them. Mirrors frontend/types/assistant.ts.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BeforeValidator, ConfigDict, Field

from app.core.enums import (
    ApplicationStage,
    AssistantActionStatus,
    AssistantInputType,
    CommunicationStatus,
    InterviewType,
    Weekday,
)
from app.schemas.ai import AISource
from app.schemas.common import APIModel, OptionalText, OptionalURL, Timestamp
from app.schemas.demo import EmploymentType, Items, Salary, Seniority, Skills, WorkArrangement, clean_list
from app.schemas.matching import CandidateMatch, InterviewState, MatchFilter
from app.schemas.portal import UTCOffset

IntentAction = Literal[
    "who_needs_update",  # "Who needs an update today?"
    "unanswered",  # "Which candidates have unanswered questions?"
    "unconfirmed_interviews",  # "Which interviews need confirmation?"
    "no_follow_up",  # "Who interviewed this week and hasn't had a follow-up?"
    "draft_message",  # "Draft Sarah an update": a message to a candidate
    "send_interview_email",  # ask a candidate to schedule an interview
    "search_candidates",  # "Show 10 applicants for ML Engineer matching Python and AWS": visible filters
    "select_candidates",  # "Select Sophia, Maya and James" (or deselect, or clear)
    "draft_outreach",  # "Draft interview invitations for the selected candidates": one draft each
    "schedule_interviews",  # "Make these 30-minute interviews next Tuesday afternoon"
    "create_job",  # "Create a Senior Product Designer role in New York": a draft, never a job
    "update_job",  # "Add Kubernetes and model monitoring": the job draft in context
    "candidate_info",
    "next_interview",
    "show_contacts",  # "Give me their phone numbers": what the applicants gave with their applications
    "confirm",  # "send it", "looks good", "yes": the proposal in context
    "cancel",
    "help",
]
Mode = Literal["draft", "execute"]  # prepare only, or prepare and ask to confirm sending
ShortText = Annotated[str, Field(max_length=200)]
ShortList = Annotated[list[ShortText], BeforeValidator(clean_list), Field(max_length=20)]


class InterviewDetails(APIModel):
    interview_type: ShortText | None = None  # "recruiter interview", "technical interview"
    duration_minutes: Annotated[int, Field(ge=10, le=480)] | None = None
    timeframe: ShortText | None = None  # "next Tuesday", "next week", "Tuesday afternoon"


class ScheduleDetails(InterviewDetails):
    """When to propose interviews: a day ("next Tuesday") and a window ("between 1 and 4 PM", "afternoon"),
    as the recruiter said them. The engine turns them into times, shown for the recruiter to check."""

    window_start: Annotated[str, Field(pattern=r"^\d{2}:\d{2}$")] | None = None  # "13:00", recruiter's time
    window_end: Annotated[str, Field(pattern=r"^\d{2}:\d{2}$")] | None = None


class JobChanges(APIModel):
    """The job a recruiter described, or what to change about the job draft in context."""

    title: ShortText | None = None
    department: ShortText | None = None
    location: ShortText | None = None
    work_arrangement: WorkArrangement | None = None
    employment_type: EmploymentType | None = None
    seniority: Seniority | None = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    skills_add: ShortList = []
    skills_remove: ShortList = []
    notes: OptionalText(1000) = None  # what the recruiter said about the role, for the AI job writer
    # A small business's job, as said (services/assistant/simple.py): never guessed.
    pay: Annotated[str, Field(max_length=100)] | None = None  # "$18/hour"
    shift: Annotated[str, Field(max_length=100)] | None = None  # "Evenings"
    work_days: Annotated[list[Weekday], Field(max_length=7)] = []
    openings: Annotated[int, Field(ge=1, le=500)] | None = None


class AssistantIntent(APIModel):
    """One request as a structured action. It names things as the recruiter said them; the engine
    resolves them to records and checks them before anything happens."""

    action: IntentAction
    mode: Mode = "draft"
    candidate_name: ShortText | None = None
    candidate_names: ShortList = []  # select_candidates, and outreach to named candidates
    job_title: ShortText | None = None
    stage: ApplicationStage | None = None
    interview: InterviewDetails | None = None
    instructions: OptionalText(1000) = None  # what a message should say
    # search_candidates: only job-related criteria and filters.
    skills: ShortList = []
    limit: Annotated[int, Field(ge=1, le=200)] | None = None
    location: ShortText | None = None
    interview_state: InterviewState | None = None
    communication: CommunicationStatus | None = None
    available_days: Annotated[list[Weekday], Field(max_length=7)] = []  # the days applicants said they can work
    refine: bool = False  # narrows the list in context ("only those in screening"), keeping its filters
    selection: Literal["replace", "add", "remove", "clear"] = "replace"  # select_candidates
    schedule: ScheduleDetails | None = None  # draft_outreach, schedule_interviews
    job: JobChanges | None = None  # create_job, update_job
    # draft_outreach: what the recruiter chose on the Candidates page; it stands whatever the instructions say.
    purpose: Literal["message", "interview_invitation"] | None = None


# Requests


class SearchState(APIModel):
    """The candidate list on screen: its filters and criteria, so "select Sophia" means the Sophia in it
    and "only those in screening" narrows it."""

    model_config = ConfigDict(extra="forbid")

    job_ids: Annotated[list[UUID], Field(max_length=20)] = []
    skills: ShortList = []
    stage: ApplicationStage | None = None
    location: ShortText | None = None
    interview: InterviewState | None = None
    communication: CommunicationStatus | None = None
    available_days: Annotated[list[Weekday], Field(max_length=7)] = []
    limit: Annotated[int, Field(ge=1, le=200)] = 10


class AssistantContext(APIModel):
    """What the conversation is about, so "send it" means the draft just made, "her" the candidate just
    discussed, "that role" the job just created and "these candidates" the ones ticked.
    The workspace sends back what the last response returned, with the recruiter's own ticks; every id
    is checked again."""

    model_config = ConfigDict(extra="forbid")

    application_id: UUID | None = None
    action_id: UUID | None = None
    job_id: UUID | None = None
    search: SearchState | None = None
    selected_application_ids: Annotated[list[UUID], Field(max_length=100)] = []


class AssistantRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=2000)]
    input_type: AssistantInputType = AssistantInputType.TEXT
    # Random per request from the workspace: the same id again (a double click, a retry) is the same request.
    client_request_id: Annotated[str, Field(min_length=8, max_length=64)] | None = None
    context: AssistantContext = AssistantContext()
    utc_offset_minutes: UTCOffset = 0
    # The browser's named time zone ("America/Chicago"), so interview times are right after a clock change.
    time_zone: Annotated[str, Field(max_length=64)] | None = None
    # What the recruiter has changed on the card of the proposal in context (context.action_id): who's
    # unticked, edited messages, the job's fields. "Yes" approves exactly what they see.
    edits: "ConfirmActionRequest | None" = None


class OutreachItemEdit(APIModel):
    """One candidate in an outreach proposal, as the recruiter left it: in or out, and their edits."""

    model_config = ConfigDict(extra="forbid")

    application_id: UUID
    include: bool = True
    subject: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    body: Annotated[str, Field(min_length=1, max_length=5000)] | None = None


class ScheduleEdit(APIModel):
    """What the recruiter can change on the proposed interviews before approving. A different day,
    window or length is a new request ("make them Wednesday morning"), so the messages say it too."""

    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    interview_type: InterviewType | None = None
    interviewers: Annotated[list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=10)] | None = (
        None
    )
    meeting_url: OptionalURL = None


class JobDraft(APIModel):
    """A job the AI drafted from what the recruiter said, for them to check and edit. Not a job yet:
    nothing exists until they approve it. Fields the recruiter didn't give are left empty to fill in."""

    title: Annotated[str, Field(min_length=1, max_length=200)]
    department: OptionalText(100) = None
    location: OptionalText(200) = None
    work_arrangement: WorkArrangement | None = None
    employment_type: EmploymentType = "Full-time"
    seniority: Seniority | None = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    salary_currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")] = "USD"
    skills: Skills = []
    summary: OptionalText(600) = None
    responsibilities: Items = []
    requirements: Items = []
    preferred_qualifications: Items = []
    description: OptionalText(3000) = None  # about the role
    # A small business's job: as the owner said it, or empty.
    pay: Annotated[str, Field(max_length=100)] | None = None
    shift: Annotated[str, Field(max_length=100)] | None = None
    work_days: Annotated[list[Weekday], Field(max_length=7)] = []
    openings: Annotated[int, Field(ge=1, le=500)] | None = None


class OutreachRequest(APIModel):
    """POST /assistant/outreach: the Candidates page's "Draft personalized outreach", for the candidates the
    recruiter ticked there. The same proposal the assistant makes from words."""

    model_config = ConfigDict(extra="forbid")

    application_ids: Annotated[list[UUID], Field(min_length=1, max_length=100)]
    purpose: Literal["interview_invitation", "message"] = "interview_invitation"
    instructions: OptionalText(500) = None
    schedule: ScheduleDetails | None = None
    client_request_id: Annotated[str, Field(min_length=8, max_length=64)] | None = None
    utc_offset_minutes: UTCOffset = 0
    time_zone: Annotated[str, Field(max_length=64)] | None = None


class ConfirmActionRequest(APIModel):
    """Confirm a proposal, with the recruiter's edits: body for one message; items and schedule for an
    outreach proposal; job for a job draft."""

    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, Field(min_length=1, max_length=5000)] | None = None
    items: Annotated[list[OutreachItemEdit], Field(max_length=100)] | None = None
    schedule: ScheduleEdit | None = None
    enable_replies: bool | None = None  # also turn on candidate messaging, so they can answer
    job: JobDraft | None = None


# Cards the workspace renders


class CandidateBrief(APIModel):
    application_id: UUID
    candidate_id: UUID
    name: str
    job_title: str
    stage: ApplicationStage


class MessageCard(APIModel):
    """A message to a candidate: a draft, or a proposal waiting for confirmation, or its outcome."""

    type: Literal["message"] = "message"
    action_id: UUID
    mode: Mode
    status: AssistantActionStatus
    candidate: CandidateBrief
    purpose: str  # "Interview invitation", "Message"
    interview_type: str | None = None
    duration_minutes: int | None = None
    timeframe: str | None = None
    body: str
    delivery: str  # where it goes: "Candidate portal messages"
    error: str | None = None
    replies_open: bool = True  # candidate messaging is on for this application
    enable_replies: bool = True  # turn it on when this is sent, so they can reply


class FollowUpItem(APIModel):
    """A candidate owed something, and what: "Moved to Offer", their message, an interview."""

    candidate: CandidateBrief
    reason: str
    detail: str | None = None
    since: Timestamp | None = None  # how long they've waited
    at: Timestamp | None = None  # an interview's time


class FollowUpListCard(APIModel):
    type: Literal["follow_ups"] = "follow_ups"
    title: str
    total: int
    items: list[FollowUpItem]
    href: str = "/recruiter/today"


class ClarifyOption(APIModel):
    label: str
    detail: str
    reply: str  # what choosing it sends back
    application_id: UUID | None = None


class ClarifyCard(APIModel):
    type: Literal["clarify"] = "clarify"
    question: str
    options: list[ClarifyOption]


class InterviewCardItem(APIModel):
    title: str
    scheduled_at: Timestamp
    duration_minutes: int
    interview_type: str
    confirmed: bool
    interviewers: list[str] = []


class InterviewInfoCard(APIModel):
    type: Literal["interview"] = "interview"
    candidate: CandidateBrief
    interview: InterviewCardItem | None


class CandidateMatchCard(APIModel):
    """Candidates against the recruiter's job-related criteria, with the filters that made the list and
    why each one is in it. Who is ticked is the recruiter's choice."""

    type: Literal["candidate_match"] = "candidate_match"
    title: str
    filters: list[MatchFilter]
    criteria: list[str]
    available_days: list[Weekday] = []  # days asked for, shown per candidate as evidence
    criteria_source: Literal["recruiter", "job_requirements", "none"]
    considered: int
    matching: int
    limit: int
    items: list[CandidateMatch]
    order: str
    selected: list[UUID] = []
    href: str  # the same list on the Candidates page, with the same filters showing


class OutreachSlot(APIModel):
    starts_at: Timestamp
    ends_at: Timestamp


class OutreachResult(APIModel):
    """What happened for one candidate once the recruiter approved it. Nothing here claims more than
    the services did: a portal message and an interview record, and email or calendar only if sent."""

    message_sent: bool = False
    email: Literal["sent", "failed", "pending", "not_configured"] | None = None
    interview_created: bool = False
    calendar: Literal["created", "not_configured", "failed"] | None = None
    messaging_enabled: bool = False
    error: str | None = None


class OutreachItem(APIModel):
    candidate: CandidateBrief
    company_name: str
    draft_id: UUID
    subject: str
    body: str
    include: bool = True
    replies_open: bool  # the candidate can already write back about this application
    slot: OutreachSlot | None = None  # the proposed interview time
    result: OutreachResult | None = None


class ScheduleProposal(APIModel):
    title: str  # "First interview"
    interview_type: InterviewType = InterviewType.VIDEO
    duration_minutes: int
    day: str | None = None  # ISO date, in the recruiter's time zone; None until they pick one
    window_start: str  # "13:00"
    window_end: str
    utc_offset_minutes: int  # the recruiter's, when it was proposed
    time_zone: str | None = None  # the recruiter's named time zone, when the browser gave it
    interviewers: list[str]
    meeting_url: str | None = None  # only a link the recruiter gave: no video service is connected
    calendar_configured: bool
    calendar_note: str
    unscheduled: int = 0  # candidates the window had no room for: pick their times


class OutreachCard(APIModel):
    """One personalized draft per candidate the recruiter picked, and the interview times proposed, if
    any. Nothing is sent or scheduled until they approve it (stage final, then confirm)."""

    type: Literal["outreach"] = "outreach"
    action_id: UUID
    status: AssistantActionStatus
    stage: Literal["review", "final", "done"] = "review"
    purpose: str  # "Interview invitation", "Message"
    items: list[OutreachItem]
    schedule: ScheduleProposal | None = None
    enable_replies: bool = True
    email_configured: bool
    delivery_note: str  # "Portal delivered — Email not configured"
    error: str | None = None


class JobDraftCard(APIModel):
    """A job drafted from what the recruiter said: to edit, cancel, or approve and create. The job
    only exists once they approve (stage created)."""

    type: Literal["job_draft"] = "job_draft"
    action_id: UUID
    status: AssistantActionStatus
    stage: Literal["draft", "confirm", "created"] = "draft"
    # simple: Simple Hire's "Ready to post" preview of a few facts; full: the whole posting to review.
    layout: Literal["full", "simple"] = "full"
    draft: JobDraft
    missing: list[str] = []  # what the recruiter didn't say, left empty for them: "Department", "Salary"
    changes: list[str] = []  # what the last request changed
    job_id: UUID | None = None
    job_href: str | None = None
    careers_href: str | None = None
    model_name: str = ""
    error: str | None = None


class ContactItem(APIModel):
    """One applicant's contact details, exactly as they gave them with their application to this job."""

    application_id: UUID
    candidate_id: UUID
    name: str
    job_title: str  # the role they applied for
    phone: str | None = None  # null: they didn't give one
    email: str


class ContactCard(APIModel):
    """The contact details applicants gave the employer when they applied: for the applications the employer
    picked, in its own workspace, and nothing found anywhere else."""

    type: Literal["contacts"] = "contacts"
    items: list[ContactItem]
    note: str = "What each applicant gave you when they applied. Use it to contact them about this job only."


AssistantCard = Annotated[
    MessageCard
    | FollowUpListCard
    | ClarifyCard
    | InterviewInfoCard
    | CandidateMatchCard
    | OutreachCard
    | JobDraftCard
    | ContactCard,
    Field(discriminator="type"),
]


class AssistantResponse(APIModel):
    id: UUID  # the request's record (assistant_actions)
    input_type: AssistantInputType
    transcript: str  # the words understood, as typed or transcribed
    intent: str | None
    status: AssistantActionStatus
    reply: str  # short, with **bold** and "-" lists
    cards: list[AssistantCard] = []
    sources: list[AISource] = []
    context: AssistantContext
    model_name: str


class AssistantHistoryItem(APIModel):
    id: UUID
    created_at: Timestamp
    executed_at: Timestamp | None = None
    input_type: AssistantInputType
    input_text: str
    intent: str | None
    status: AssistantActionStatus
    summary: str
    target_label: str | None = None
    href: str | None = None


class AssistantStatus(APIModel):
    """GET /assistant/status: what the assistant can do here."""

    voice_transcription: bool  # the server can transcribe speech (else the browser's own recognition)
    model_name: str
    email_configured: bool = False  # messages are also emailed; else they reach the candidate portal only
    calendar_configured: bool = False  # interviews also become calendar events; else TalentBridge only


class TranscriptionRead(APIModel):
    text: str
    model_name: str


AssistantRequest.model_rebuild()
