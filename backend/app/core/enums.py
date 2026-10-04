"""Domain enums shared by the models, the API schemas and the services.

Values match the Postgres enum types in supabase/migrations and the frontend's types/*.ts.
"""

from enum import StrEnum


class UserRole(StrEnum):
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
    ADMIN = "admin"


# Roles that may use the recruiter workspace.
STAFF_ROLES: frozenset[UserRole] = frozenset({UserRole.RECRUITER, UserRole.ADMIN})


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
    PROFILE_UPDATED = "profile_updated"  # the candidate edited their contact details
    AI_ANALYSIS_GENERATED = "ai_analysis_generated"
    # Ashby archived the application for a reason other than rejection (withdrawn, other). Rejections
    # are a stage change to rejected instead.
    APPLICATION_CLOSED = "application_closed"
    PORTAL_INVITED = "portal_invited"  # internal: the candidate portal invitation went out


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
        ActivityType.PROFILE_UPDATED,
    }
)


class ApplicationBucket(StrEnum):
    """Where an application sits in the candidate portal. Derived from the stage, never stored."""

    ACTIVE = "active"
    INACTIVE = "inactive"  # withdrawn, hired, or the role closed
    NO_LONGER_CONSIDERED = "no_longer_considered"  # rejected or another non-selection


class PortalAccountStatus(StrEnum):
    """The candidate's portal sign-in. Stored as text (migration 011)."""

    NOT_REQUIRED = "not_required"  # added in Talent Bridge; nobody asked for portal access
    PENDING_INVITATION = "pending_invitation"  # should be invited; not sent yet (or invites aren't configured)
    INVITED = "invited"  # an account exists or an invitation went out; not signed in yet
    ACTIVE = "active"  # signed in to the portal at least once
    INVITE_FAILED = "invite_failed"  # the last attempt failed; retryable


class MessageKind(StrEnum):
    """What the candidate said their message is, chosen in the portal. Never inferred from content."""

    MESSAGE = "message"
    THANK_YOU = "thank_you"
    FOLLOW_UP = "follow_up"
    QUESTION = "question"


class EngagementLevel(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


class EngagementEventType(StrEnum):
    """First-party portal behaviour that no other table records. Stored as text (migration 012).

    Actions with their own records (messages, interview confirmations, profile edits) are read from
    those records instead, so there is one source of truth for each fact.
    """

    PORTAL_LOGIN = "portal_login"  # first portal visit in a new Supabase Auth session
    PORTAL_SESSION_STARTED = "portal_session_started"
    PAGE_VIEW = "page_view"
    APPLICATION_VIEWED = "application_viewed"
    INTERVIEW_VIEWED = "interview_viewed"
    PREP_VIEWED = "prep_viewed"
    MESSAGE_READ = "message_read"


# The only types the portal may send to POST /candidate/engagement/events. The rest are recorded by
# the server as a side effect of the request that caused them.
CLIENT_ENGAGEMENT_EVENTS: frozenset[EngagementEventType] = frozenset(
    {EngagementEventType.PAGE_VIEW, EngagementEventType.APPLICATION_VIEWED, EngagementEventType.INTERVIEW_VIEWED}
)


class PortalPage(StrEnum):
    DASHBOARD = "dashboard"
    APPLICATIONS = "applications"  # the list of every application
    APPLICATION = "application"  # one application
    INTERVIEWS = "interviews"
    MESSAGES = "messages"
    COMPANY = "company"
    AI = "ai"
    PREP = "prep"
    PROFILE = "profile"


class WebhookEventStatus(StrEnum):
    PROCESSING = "processing"
    PROCESSED = "processed"
    IGNORED = "ignored"  # an action we don't handle, or an update older than what we have
    FAILED = "failed"  # retried when Ashby redelivers it
