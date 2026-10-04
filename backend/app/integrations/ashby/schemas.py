"""Ashby's payloads, typed. Field names follow Ashby's API reference (developers.ashbyhq.com, API
version 2026-01-01); unknown fields are ignored, so additions on Ashby's side never break parsing.

Some fields are deliberately absent so they can't be stored or leak: the archive reason's text
(internal to the hiring team), interview feedback links, the submitter's IP address and browser.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel


class AshbyModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore", frozen=True)


def normalize_email(value: str | None) -> str | None:
    """Lowercased and trimmed, or None when blank."""
    email = (value or "").strip().lower()
    return email or None


class ContactValue(AshbyModel):
    value: str


class CandidateLocation(AshbyModel):
    location_summary: str | None = None


class AshbyCandidate(AshbyModel):
    """A candidate: the summary in webhooks (id, name, email, phone) or the full candidate.info record."""

    id: str
    name: str | None = None
    primary_email_address: ContactValue | None = None
    email_addresses: list[ContactValue] = []
    primary_phone_number: ContactValue | None = None
    position: str | None = None
    company: str | None = None
    location: CandidateLocation | None = None
    updated_at: datetime | None = None

    @property
    def email(self) -> str | None:
        primary = normalize_email(self.primary_email_address.value if self.primary_email_address else None)
        return primary or next(
            (email for item in self.email_addresses if (email := normalize_email(item.value))), None
        )

    @property
    def first_and_last_name(self) -> tuple[str, str]:
        first, _, last = (self.name or "").strip().partition(" ")
        return first or (self.email or "Candidate").split("@")[0], last.strip()

    @property
    def headline(self) -> str | None:
        return " at ".join(part for part in (self.position, self.company) if part) or None


class InterviewStage(AshbyModel):
    id: str
    title: str
    type: str | None = None


class ArchiveReason(AshbyModel):
    reason_type: str | None = None  # RejectedByOrg, RejectedByCandidate or Other. The text is not read.


class Source(AshbyModel):
    title: str | None = None


class JobRef(AshbyModel):
    """The job as an application payload describes it."""

    id: str
    title: str | None = None


class AshbyApplication(AshbyModel):
    id: str
    created_at: datetime | None = None
    updated_at: datetime
    status: str  # Active, Lead, Hired or Archived
    candidate: AshbyCandidate
    current_interview_stage: InterviewStage | None = None
    source: Source | None = None
    archive_reason: ArchiveReason | None = None
    archived_at: datetime | None = None
    job: JobRef


class JobLocation(AshbyModel):
    name: str | None = None


class AshbyJob(AshbyModel):
    """A job from jobCreate/jobUpdate or job.info (with expand location)."""

    id: str
    title: str
    status: str | None = None  # Draft, Open, Closed or Archived
    employment_type: str | None = None
    location: JobLocation | None = None
    updated_at: datetime | None = None


class Interviewer(AshbyModel):
    first_name: str | None = None
    last_name: str | None = None

    @property
    def name(self) -> str | None:
        return " ".join(part for part in (self.first_name, self.last_name) if part) or None


class InterviewDetails(AshbyModel):
    title: str | None = None


class InterviewEvent(AshbyModel):
    id: str
    interview_id: str | None = None
    start_time: datetime
    end_time: datetime
    location: str | None = None
    meeting_link: str | None = None
    interviewers: list[Interviewer] = []
    updated_at: datetime | None = None
    interview: InterviewDetails | None = None  # only when Ashby expands it


class InterviewSchedule(AshbyModel):
    id: str
    status: str
    application_id: str
    interview_stage_id: str | None = None
    interview_events: list[InterviewEvent] = []
    updated_at: datetime | None = None


class EntityRef(AshbyModel):
    id: str


class CandidateMerge(AshbyModel):
    deleted_candidate: EntityRef
    merged_candidate: EntityRef


class WebhookEnvelope(AshbyModel):
    """Every webhook: {"webhookActionId", "action", "data"}. The id repeats across retries."""

    webhook_action_id: str | None = None
    action: str
    data: dict[str, Any] = {}

    @field_validator("action")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("action is required")
        return value.strip()
