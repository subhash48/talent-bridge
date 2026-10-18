"""Communication records as the recruiter API shows them. No database access, so the pipeline, the
candidate panel and the communication routes can all use it."""

from datetime import datetime

from app.models import Application, CommunicationDraft
from app.schemas.communication import (
    AttentionRead,
    CommunicationHealthRead,
    CommunicationSummary,
    DraftRead,
    FollowUpCheckRead,
    InterviewCheckRead,
    OpenQuestionRead,
    StageChangeRead,
)
from app.services import candidate_visibility
from app.services.communication.health import Health


def candidate_status(application: Application) -> str:
    """The status the candidate sees in their portal. The job must be loaded."""
    return candidate_visibility.portal_status(application, application.job.status).label


def health_read(application: Application, health: Health, now: datetime) -> CommunicationHealthRead:
    return CommunicationHealthRead(
        status=health.status,
        candidate_status=candidate_status(application),
        last_update_at=health.last_update_at,
        waiting_since=health.waiting_since,
        days_since_update=health.days_since_update(now),
        open_question=OpenQuestionRead.model_validate(health.open_question) if health.open_question else None,
        next_interview=InterviewCheckRead.model_validate(health.next_interview) if health.next_interview else None,
        last_interview=FollowUpCheckRead.model_validate(health.last_interview) if health.last_interview else None,
        stage_change=StageChangeRead.model_validate(health.stage_change) if health.stage_change else None,
        attention=[AttentionRead.model_validate(item) for item in health.attention],
        next_due_at=health.next_due_at,
    )


def summary(health: Health, now: datetime) -> CommunicationSummary:
    return CommunicationSummary(
        status=health.status,
        last_update_at=health.last_update_at,
        days_since_update=health.days_since_update(now),
        reason=health.attention[0].title if health.attention else None,
    )


def draft_read(draft: CommunicationDraft) -> DraftRead:
    return DraftRead(
        id=draft.id,
        application_id=draft.application_id,
        reason=draft.reason,
        status=draft.status,
        subject=draft.subject,
        body=draft.body,
        edited=(draft.subject, draft.body) != (draft.ai_subject, draft.ai_body),
        model_name=draft.model_name,
        message_id=draft.message_id,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
        sent_at=draft.sent_at,
        discarded_at=draft.discarded_at,
    )
