"""How Ashby's states map onto Talent Bridge's. Every rule is a table here, so changing a mapping is a
one-line edit; custom stage titles can also be mapped without a code change (ASHBY_STAGE_TITLE_MAP).

Ashby pipelines use custom stage titles, but every stage has one of a few types, so stages map by
type unless their title is listed. Ashby's raw stage id, title, type, status and archive reason type
are stored on the application regardless, so nothing is lost when a mapping changes.

Where the application then appears in the candidate portal (active, inactive, no longer under
consideration) is derived from the result in services/candidate_visibility.py.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from app.core.enums import ApplicationStage, InterviewStatus, InterviewType, JobStatus
from app.integrations.ashby.schemas import AshbyApplication, InterviewEvent, InterviewStage

S = ApplicationStage

# Ashby interview stage type -> Talent Bridge stage. "Archived" isn't here: archiving is handled by
# status and archive reason below, and keeps the stage the application had reached.
STAGE_TYPES: dict[str, ApplicationStage] = {
    "Lead": S.SOURCED,
    "PreInterviewScreen": S.SCREENING,
    "Active": S.INTERVIEW,
    "Offer": S.OFFER,
    "Hired": S.HIRED,
}

# Archive reason types that mean the organisation didn't select the candidate. The application
# moves to rejected. Other archives (withdrawn, other) keep their stage and leave the pipeline.
REJECTION_REASON_TYPES = frozenset({"RejectedByOrg"})

# Ashby application statuses whose applicants are invited to the candidate portal. Leads were
# sourced by the team and never applied, so they aren't.
INVITE_STATUSES = frozenset({"Active"})

JOB_STATUSES: dict[str, JobStatus] = {
    "Open": JobStatus.OPEN,
    "Draft": JobStatus.DRAFT,
    "Closed": JobStatus.CLOSED,
    "Archived": JobStatus.CLOSED,
}

EMPLOYMENT_TYPES = {
    "FullTime": "Full-time",
    "PartTime": "Part-time",
    "Intern": "Internship",
    "Contract": "Contract",
    "Temporary": "Temporary",
}

# Interview schedule status -> interview status. Anything else (Scheduled, WaitingOnCandidate...,
# OnHold, Unknown, new values) is scheduled.
SCHEDULE_STATUSES: dict[str, InterviewStatus] = {
    "Cancelled": InterviewStatus.CANCELLED,
    "Complete": InterviewStatus.COMPLETED,
    "WaitingOnFeedback": InterviewStatus.COMPLETED,
}

MIN_INTERVIEW_MINUTES, MAX_INTERVIEW_MINUTES = 15, 480  # the interviews table's check constraint


@dataclass(frozen=True)
class ApplicationState:
    """What an Ashby application means here. stage None: keep the stage the application has."""

    stage: ApplicationStage | None
    archived: bool
    archived_at: datetime | None
    reason_type: str | None


def stage_for(stage: InterviewStage | None, title_map: Mapping[str, ApplicationStage]) -> ApplicationStage | None:
    """The Talent Bridge stage for an Ashby interview stage: by title if mapped, else by type."""
    if stage is None:
        return None
    return title_map.get(stage.title.strip().lower()) or STAGE_TYPES.get(stage.type or "")


def application_state(
    application: AshbyApplication, title_map: Mapping[str, ApplicationStage], *, now: datetime
) -> ApplicationState:
    reason = application.archive_reason.reason_type if application.archive_reason else None
    if application.status == "Hired":
        return ApplicationState(S.HIRED, archived=False, archived_at=None, reason_type=None)
    if application.status == "Archived":
        # A rejection moves to rejected. Otherwise the application keeps the stage it reached: the
        # one in the payload if it maps (None for Ashby's own Archived stage keeps the current one).
        if reason in REJECTION_REASON_TYPES:
            stage = S.REJECTED
        else:
            stage = stage_for(application.current_interview_stage, title_map)
        return ApplicationState(stage, archived=True, archived_at=application.archived_at or now, reason_type=reason)
    stage = stage_for(application.current_interview_stage, title_map)
    if stage is None and application.status == "Lead":
        stage = S.SOURCED
    return ApplicationState(stage, archived=False, archived_at=None, reason_type=None)


def interview_status(schedule_status: str) -> InterviewStatus:
    return SCHEDULE_STATUSES.get(schedule_status, InterviewStatus.SCHEDULED)


def interview_type(event: InterviewEvent) -> InterviewType:
    """A meeting link means video; a location without one means on site."""
    if event.meeting_link:
        return InterviewType.VIDEO
    return InterviewType.ONSITE if event.location else InterviewType.VIDEO


def interview_minutes(event: InterviewEvent) -> int:
    minutes = round((event.end_time - event.start_time).total_seconds() / 60)
    return max(MIN_INTERVIEW_MINUTES, min(MAX_INTERVIEW_MINUTES, minutes))


def meeting_url(event: InterviewEvent) -> str | None:
    link = (event.meeting_link or "").strip()
    return link if link.startswith(("https://", "http://")) else None
