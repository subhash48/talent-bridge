"""Domain enums shared by the models, the API schemas and the services.

Values match the Postgres enum types in supabase/migrations and the frontend's types/*.ts.
"""

from enum import StrEnum


class UserRole(StrEnum):
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
    ADMIN = "admin"


class JobStatus(StrEnum):
    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"


class ApplicationStage(StrEnum):
    SOURCED = "sourced"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"

    @property
    def label(self) -> str:
        return self.value.capitalize()


class InterviewType(StrEnum):
    VIDEO = "video"
    PHONE = "phone"
    ONSITE = "onsite"


class InterviewStatus(StrEnum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SenderType(StrEnum):
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"
    SYSTEM = "system"
    AI = "ai"


class ActivityType(StrEnum):
    """What happened on an application. Stored as text, so new types need no migration."""

    APPLICATION_CREATED = "application_created"
    STAGE_CHANGED = "stage_changed"
    APPLICATION_ARCHIVED = "application_archived"
    APPLICATION_RESTORED = "application_restored"
    ONBOARDING_STARTED = "onboarding_started"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_CONFIRMED = "interview_confirmed"
    INTERVIEW_RESCHEDULE_REQUESTED = "interview_reschedule_requested"
    INTERVIEW_COMPLETED = "interview_completed"
    INTERVIEW_CANCELLED = "interview_cancelled"
    MESSAGE_SENT = "message_sent"  # recruiter to candidate
    MESSAGE_RECEIVED = "message_received"  # candidate to recruiter
    RESUME_VIEWED = "resume_viewed"
    DOCUMENT_SHARED = "document_shared"
    PREP_VIEWED = "prep_viewed"
    QUESTION_ASKED = "question_asked"
    ASSESSMENT_SENT = "assessment_sent"
    ASSESSMENT_COMPLETED = "assessment_completed"
    OFFER_SENT = "offer_sent"
    OFFER_VIEWED = "offer_viewed"
    OFFER_ACCEPTED = "offer_accepted"
    AI_ANALYSIS_GENERATED = "ai_analysis_generated"


# Things the candidate did themselves. Engagement is measured on these alone (services/engagement).
CANDIDATE_ACTIONS: frozenset[str] = frozenset(
    {
        ActivityType.INTERVIEW_CONFIRMED,
        ActivityType.INTERVIEW_RESCHEDULE_REQUESTED,
        ActivityType.INTERVIEW_COMPLETED,
        ActivityType.MESSAGE_RECEIVED,
        ActivityType.DOCUMENT_SHARED,
        ActivityType.PREP_VIEWED,
        ActivityType.QUESTION_ASKED,
        ActivityType.ASSESSMENT_COMPLETED,
        ActivityType.OFFER_VIEWED,
        ActivityType.OFFER_ACCEPTED,
    }
)
