"""The recruiter assistant (/assistant/*): one action engine for typed and spoken requests.

A request is understood as one AssistantIntent (a structured action), whatever words it used and
whether it was typed or transcribed. The response carries the reply and cards the workspace renders.
External actions come back as proposals that only run when the recruiter confirms them. Mirrors
frontend/types/assistant.ts.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from app.core.enums import ApplicationStage, AssistantActionStatus, AssistantInputType
from app.schemas.ai import AISource
from app.schemas.common import APIModel, OptionalText, Timestamp
from app.schemas.demo import EmploymentType, Seniority, WorkArrangement
from app.schemas.portal import UTCOffset

IntentAction = Literal[
    "send_interview_email",  # ask a candidate to schedule an interview
    "draft_message",  # any other message to a candidate
    "create_job",
    "update_job",
    "publish_job",
    "list_jobs",
    "search_candidates",
    "candidate_info",
    "next_interview",
    "analytics",
    "confirm",  # "send it", "publish it": the proposal in context
    "cancel",
    "help",
]
Mode = Literal["draft", "execute"]  # prepare only, or prepare and ask to confirm sending/publishing
AnalyticsMetric = Literal[
    "overview",
    "active_candidates",
    "weekly_engaged",
    "avg_engagement_time",
    "repeat_visit_rate",
    "engagement_change",
    "top_topics",
    "peak_activity",
    "regions",
    "demographics",
]
AnalyticsPeriodName = Literal[
    "today", "this_week", "last_7_days", "this_month", "last_month", "last_30_days", "last_90_days", "this_year"
]
DemographicDimensionName = Literal["region", "race_ethnicity", "disability_status", "sexual_orientation"]
ShortText = Annotated[str, Field(max_length=200)]


class InterviewDetails(APIModel):
    interview_type: ShortText | None = None  # "recruiter interview", "technical interview"
    duration_minutes: Annotated[int, Field(ge=10, le=480)] | None = None
    timeframe: ShortText | None = None  # "next Tuesday", "next week", "Tuesday afternoon"


class JobChanges(APIModel):
    """The job a recruiter described, or what to change about the draft in context."""

    title: ShortText | None = None
    department: ShortText | None = None
    location: ShortText | None = None
    work_arrangement: WorkArrangement | None = None
    employment_type: EmploymentType | None = None
    seniority: Seniority | None = None
    salary_min: Annotated[int, Field(gt=0, le=10_000_000)] | None = None
    salary_max: Annotated[int, Field(gt=0, le=10_000_000)] | None = None
    skills_add: list[ShortText] = []
    skills_remove: list[ShortText] = []
    notes: OptionalText(1000) = None  # what the recruiter said about the role, for the AI job writer
    shorter: bool = False  # "make the description shorter"


class AssistantIntent(APIModel):
    """One request as a structured action. It names things as the recruiter said them; the engine
    resolves them to records and checks them before anything happens."""

    action: IntentAction
    mode: Mode = "draft"
    candidate_name: ShortText | None = None
    job_title: ShortText | None = None
    stage: ApplicationStage | None = None
    interview: InterviewDetails | None = None
    instructions: OptionalText(1000) = None  # what a message should say
    job: JobChanges | None = None
    metric: AnalyticsMetric | None = None
    period: AnalyticsPeriodName | None = None
    demographic: DemographicDimensionName | None = None


# Requests


class AssistantContext(APIModel):
    """What the conversation is about, so "make it hybrid" or "send it" means the draft just made.
    The workspace sends back what the last response returned; every id is checked again."""

    model_config = ConfigDict(extra="forbid")

    application_id: UUID | None = None
    job_id: UUID | None = None
    action_id: UUID | None = None


class AssistantRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=2000)]
    input_type: AssistantInputType = AssistantInputType.TEXT
    # Random per request from the workspace: the same id again (a double click, a retry) is the same request.
    client_request_id: Annotated[str, Field(min_length=8, max_length=64)] | None = None
    context: AssistantContext = AssistantContext()
    utc_offset_minutes: UTCOffset = 0


class ConfirmActionRequest(APIModel):
    """Confirm a proposal. body replaces the prepared message, when the recruiter edited it."""

    model_config = ConfigDict(extra="forbid")

    body: Annotated[str, Field(min_length=1, max_length=5000)] | None = None


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


class JobCardJob(APIModel):
    id: UUID
    title: str
    location: str | None = None
    work_arrangement: str | None = None
    seniority: str | None = None
    employment_type: str
    salary: str | None = None  # "$100K–$130K"
    skills: list[str] = []
    summary: str | None = None
    status: str  # the posting: draft, published or closed
    review_path: str  # /recruiter/jobs/demo/{id}
    public_path: str  # /demo/careers/{id}


class JobCard(APIModel):
    type: Literal["job"] = "job"
    action_id: UUID | None = None  # set while a publish waits for confirmation
    status: AssistantActionStatus
    stage: Literal["draft_created", "draft_updated", "ready_to_publish", "published"]
    job: JobCardJob
    changes: list[str] = []


class CandidateListCard(APIModel):
    type: Literal["candidates"] = "candidates"
    title: str
    total: int
    items: list[CandidateBrief]


class JobListItem(APIModel):
    id: UUID
    title: str
    location: str | None = None
    status: str
    candidates: int


class JobListCard(APIModel):
    type: Literal["jobs"] = "jobs"
    items: list[JobListItem]


class ClarifyOption(APIModel):
    label: str
    detail: str
    reply: str  # what choosing it sends back
    application_id: UUID | None = None


class ClarifyCard(APIModel):
    type: Literal["clarify"] = "clarify"
    question: str
    options: list[ClarifyOption]


class AnalyticsRow(APIModel):
    label: str
    value: str


class AnalyticsCard(APIModel):
    type: Literal["analytics"] = "analytics"
    title: str
    period: str
    rows: list[AnalyticsRow]
    href: str  # the Analytics page with the same range


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


AssistantCard = Annotated[
    MessageCard | JobCard | CandidateListCard | JobListCard | ClarifyCard | AnalyticsCard | InterviewInfoCard,
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
    jobs: bool  # creating and publishing demo jobs is switched on
    model_name: str


class TranscriptionRead(APIModel):
    text: str
    model_name: str
