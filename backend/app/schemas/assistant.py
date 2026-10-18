"""The recruiter assistant (/assistant/*): one action engine for typed and spoken requests, about
candidate communication: who needs an update, what they're waiting for, and drafts to send.

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
from app.schemas.portal import UTCOffset

IntentAction = Literal[
    "who_needs_update",  # "Who needs an update today?"
    "unanswered",  # "Which candidates have unanswered questions?"
    "unconfirmed_interviews",  # "Which interviews need confirmation?"
    "no_follow_up",  # "Who interviewed this week and hasn't had a follow-up?"
    "draft_message",  # "Draft Sarah an update": a message to a candidate
    "send_interview_email",  # ask a candidate to schedule an interview
    "search_candidates",
    "candidate_info",
    "next_interview",
    "confirm",  # "send it": the proposal in context
    "cancel",
    "help",
]
Mode = Literal["draft", "execute"]  # prepare only, or prepare and ask to confirm sending
ShortText = Annotated[str, Field(max_length=200)]


class InterviewDetails(APIModel):
    interview_type: ShortText | None = None  # "recruiter interview", "technical interview"
    duration_minutes: Annotated[int, Field(ge=10, le=480)] | None = None
    timeframe: ShortText | None = None  # "next Tuesday", "next week", "Tuesday afternoon"


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


# Requests


class AssistantContext(APIModel):
    """What the conversation is about, so "send it" means the draft just made, and "her" the
    candidate just discussed.
    The workspace sends back what the last response returned; every id is checked again."""

    model_config = ConfigDict(extra="forbid")

    application_id: UUID | None = None
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


class CandidateListCard(APIModel):
    type: Literal["candidates"] = "candidates"
    title: str
    total: int
    items: list[CandidateBrief]


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


AssistantCard = Annotated[
    MessageCard | CandidateListCard | FollowUpListCard | ClarifyCard | InterviewInfoCard,
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


class TranscriptionRead(APIModel):
    text: str
    model_name: str
