"""The privacy boundary between the recruiter's record and the candidate portal.

Everything the portal returns about an application is built here, and it works as an allowlist:

- Activity is shown only for the types in present_activity, with titles written here. A recruiter's
  free text (stage-change reasons, descriptions) and activity metadata never reach the candidate,
  and new activity types stay hidden until they are added on purpose. Internal entries such as AI
  analyses, archiving and resume views are never shown.
- Interviews lose their notes, which hold interviewer feedback, and the meeting link once over.
- Messages are the candidate's own thread with the hiring team.
- An application's status is one of three plain buckets (active, inactive, no longer under
  consideration). Why an application closed, and Ashby's internal stage names, never reach the
  candidate.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.enums import (
    ActivityType,
    ApplicationBucket,
    ApplicationStage,
    InterviewStatus,
    JobStatus,
    MessageKind,
    SenderType,
)
from app.models import Application, Candidate, CandidateActivity, CandidateStageHistory, Interview, Job, Message
from app.schemas.portal import (
    ActivityKind,
    PortalActivity,
    PortalCandidate,
    PortalInterview,
    PortalJob,
    PortalMessage,
    PortalStep,
    StepState,
)

S = ApplicationStage
A = ActivityType
B = ApplicationBucket

NO_LONGER_CONSIDERED = "No longer under consideration"

# The pipeline as the candidate sees it. Sourced reads as Applied.
PROGRESS: tuple[ApplicationStage, ...] = (S.SOURCED, S.SCREENING, S.INTERVIEW, S.OFFER, S.HIRED)
STAGE_LABELS: dict[ApplicationStage, str] = {
    S.SOURCED: "Applied",
    S.SCREENING: "Screening",
    S.INTERVIEW: "Interview",
    S.OFFER: "Offer",
    S.HIRED: "Hired",
    S.REJECTED: NO_LONGER_CONSIDERED,
}

# Archived applications (Ashby's archive, or a recruiter's here), by archive reason type. The
# organisation's non-selection reads as no longer under consideration; anything else (the candidate
# withdrew, the role was filled, a duplicate) as inactive. Edit these tables to change the mapping.
ARCHIVE_REASON_BUCKETS: dict[str | None, ApplicationBucket] = {
    "RejectedByOrg": B.NO_LONGER_CONSIDERED,
    "RejectedByCandidate": B.INACTIVE,
    "Other": B.INACTIVE,
    None: B.INACTIVE,
}
ARCHIVE_REASON_LABELS: dict[str | None, str] = {"RejectedByCandidate": "Withdrawn"}
# The order the portal lists buckets in, and picks the application it opens on.
BUCKET_ORDER = (B.ACTIVE, B.NO_LONGER_CONSIDERED, B.INACTIVE)


@dataclass(frozen=True)
class PortalStatus:
    bucket: ApplicationBucket
    label: str  # safe to show the candidate: a stage, "Hired", "Withdrawn", "Role closed"...

VISIBLE_SENDERS = frozenset({SenderType.CANDIDATE, SenderType.RECRUITER, SenderType.SYSTEM})
# Messages the candidate receives, and so can have unread.
INCOMING_SENDERS = frozenset({SenderType.RECRUITER, SenderType.SYSTEM})

_INTERVIEW_VERBS = (" scheduled", " rescheduled", " completed", " cancelled")


def present_candidate(candidate: Candidate) -> PortalCandidate:
    return PortalCandidate.model_validate(candidate)


def present_job(job: Job, company: str) -> PortalJob:
    return PortalJob(
        id=job.id,
        title=job.title,
        company=company,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        description=job.description,
        hiring_manager=job.hiring_manager,
    )


def portal_status(application: Application, job_status: JobStatus) -> PortalStatus:
    """Where the application sits for the candidate. Derived; the real stage is never changed."""
    stage = application.stage
    if stage == S.REJECTED:
        return PortalStatus(B.NO_LONGER_CONSIDERED, NO_LONGER_CONSIDERED)
    if stage == S.HIRED:
        return PortalStatus(B.INACTIVE, "Hired")
    if application.archived_at is not None:
        reason = application.external_archive_reason_type
        bucket = ARCHIVE_REASON_BUCKETS.get(reason, B.INACTIVE)
        if bucket == B.NO_LONGER_CONSIDERED:
            return PortalStatus(bucket, NO_LONGER_CONSIDERED)
        return PortalStatus(bucket, ARCHIVE_REASON_LABELS.get(reason, "Closed"))
    if job_status == JobStatus.CLOSED:
        return PortalStatus(B.INACTIVE, "Role closed")
    return PortalStatus(B.ACTIVE, STAGE_LABELS[stage])


def build_steps(
    application: Application, history: Sequence[CandidateStageHistory], bucket: ApplicationBucket
) -> list[PortalStep]:
    """The five pipeline steps with their state and when each was last entered."""
    ordered = sorted(history, key=lambda row: row.changed_at)
    entered = {row.new_stage: row.changed_at for row in ordered}
    stage = application.stage
    if stage == S.REJECTED:
        # Show how far the application got before it closed.
        closing = next((row for row in reversed(ordered) if row.new_stage == S.REJECTED), None)
        reached = closing.previous_stage if closing and closing.previous_stage in PROGRESS else S.SOURCED
        position, finished = PROGRESS.index(reached), True
    else:
        # A hired, withdrawn or closed application is finished where it stopped.
        position, finished = PROGRESS.index(stage), stage == S.HIRED or bucket != B.ACTIVE

    steps = []
    for index, step in enumerate(PROGRESS):
        state: StepState
        if index < position or (finished and index == position):
            state = "complete"
        elif index == position:
            state = "current"
        else:
            state = "upcoming"
        reached_at = entered.get(step) if state != "upcoming" else None
        if step == S.SOURCED and state != "upcoming":
            reached_at = reached_at or application.applied_at
        steps.append(PortalStep(stage=step, label=STAGE_LABELS[step], state=state, reached_at=reached_at))
    return steps


def interview_is_upcoming(interview: Interview, now: datetime) -> bool:
    """Scheduled and not over yet, so an interview in progress still shows its meeting link."""
    ends = interview.scheduled_at + timedelta(minutes=interview.duration_minutes)
    return interview.status == InterviewStatus.SCHEDULED and ends > now


def present_interview(interview: Interview, now: datetime) -> PortalInterview:
    upcoming = interview_is_upcoming(interview, now)
    return PortalInterview(
        id=interview.id,
        title=interview.title,
        interview_type=interview.interview_type,
        scheduled_at=interview.scheduled_at,
        duration_minutes=interview.duration_minutes,
        status=interview.status,
        meeting_url=interview.meeting_url if upcoming else None,
        interviewers=list(interview.interviewers),
        confirmed_at=interview.confirmed_at,
        upcoming=upcoming,
        can_confirm=can_confirm(interview, now),
    )


def can_confirm(interview: Interview, now: datetime) -> bool:
    return interview.status == InterviewStatus.SCHEDULED and interview.scheduled_at > now and not interview.confirmed_at


def is_unread_for_candidate(message: Message) -> bool:
    return message.sender_type in INCOMING_SENDERS and message.read_at is None


def present_message(
    message: Message, *, candidate_name: str, recruiter_name: str | None, company: str
) -> PortalMessage | None:
    if message.sender_type not in VISIBLE_SENDERS:
        return None
    names = {
        SenderType.CANDIDATE: candidate_name,
        SenderType.RECRUITER: recruiter_name or f"{company} recruiting",
        SenderType.SYSTEM: company,
    }
    return PortalMessage(
        id=message.id,
        sender_type=message.sender_type,
        sender_name=names[message.sender_type],
        content=message.content,
        kind=message.kind,
        created_at=message.created_at,
        read_at=message.read_at,
    )


def present_activity(activity: CandidateActivity, interview_titles: Mapping[str, str]) -> PortalActivity | None:
    """The entry in the candidate's words, or None when the candidate shouldn't see it."""
    described = _describe(activity, interview_titles)
    if described is None:
        return None
    kind, title = described
    return PortalActivity(id=activity.id, kind=kind, title=title, created_at=activity.created_at)


def _describe(activity: CandidateActivity, interview_titles: Mapping[str, str]) -> tuple[ActivityKind, str] | None:
    try:
        activity_type = ActivityType(activity.activity_type)
    except ValueError:
        return None
    meta = activity.meta or {}
    interview = interview_titles.get(str(meta.get("interview_id")))

    match activity_type:
        case A.APPLICATION_CREATED:
            return "application", "Application received" if meta.get("origin") == "ashby" else "Application submitted"
        case A.APPLICATION_CLOSED:
            return "application", CLOSED_TITLES.get(meta.get("outcome"), "Application closed")
        case A.STAGE_CHANGED:
            target = meta.get("to")
            if target not in STAGE_LABELS:
                return "stage", "Application updated"
            stage = ApplicationStage(target)
            return "stage", NO_LONGER_CONSIDERED if stage == S.REJECTED else f"Moved to {STAGE_LABELS[stage]}"
        case A.ONBOARDING_STARTED:
            return "stage", "Onboarding started"
        case A.INTERVIEW_SCHEDULED | A.INTERVIEW_COMPLETED | A.INTERVIEW_CANCELLED:
            verb = {
                A.INTERVIEW_SCHEDULED: "scheduled",
                A.INTERVIEW_COMPLETED: "completed",
                A.INTERVIEW_CANCELLED: "cancelled",
            }[activity_type]
            if activity.title.endswith(_INTERVIEW_VERBS):
                return "interview", activity.title  # "{interview title} scheduled", written by the system
            return "interview", f"{interview} {verb}" if interview else f"Interview {verb}"
        case A.INTERVIEW_CONFIRMED:
            title = interview or meta.get("interview_title")
            return "interview", f"You confirmed the {title}" if title else "You confirmed your interview"
        case A.INTERVIEW_RESCHEDULE_REQUESTED:
            return "interview", "You asked to reschedule an interview"
        case A.MESSAGE_SENT:
            sender = meta.get("sent_by")
            first = sender.split()[0] if isinstance(sender, str) and sender.strip() else None
            return "message", f"New message from {first}" if first else "New message from the hiring team"
        case A.MESSAGE_RECEIVED:
            return "message", MESSAGE_TITLES.get(meta.get("kind"), "You sent a message")
        case A.DOCUMENT_SHARED:
            return "document", "Document shared"
        case A.PREP_VIEWED:
            return "prep", "You viewed interview prep"
        case A.QUESTION_ASKED:
            topic = activity.title.removeprefix("Asked about ")
            return "question", f"You asked about {topic}" if topic != activity.title else "You asked a question"
        case A.ASSESSMENT_SENT:
            return "document", "Assessment sent to you"
        case A.ASSESSMENT_COMPLETED:
            return "document", "You submitted your assessment"
        case A.OFFER_SENT:
            return "offer", "Offer sent"
        case A.OFFER_VIEWED:
            return "offer", "You viewed your offer"
        case A.OFFER_ACCEPTED:
            return "offer", "Offer accepted"
        case A.PROFILE_UPDATED:
            return "profile", "You updated your profile"
        case _:
            # Internal: application_archived, application_restored, resume_viewed, ai_analysis_generated,
            # portal_invited.
            return None


CLOSED_TITLES = {"withdrawn": "Application withdrawn", "no_longer_considered": NO_LONGER_CONSIDERED}

MESSAGE_TITLES = {
    MessageKind.THANK_YOU: "You sent a thank-you note",
    MessageKind.FOLLOW_UP: "You sent a follow-up",
    MessageKind.QUESTION: "You asked a question",
}
