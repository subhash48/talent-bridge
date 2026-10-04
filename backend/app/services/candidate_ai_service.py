"""The candidate assistant: interview prep and answers about the candidate's own application.

Separate from the recruiter AI by construction. Its context is assembled from the portal record
(the same projections the candidate already sees), never from the recruiter's CandidateContext,
so internal notes, interviewer feedback, AI analysis, engagement and other candidates are out of
reach. The recruiter's timeline records the topic of each question, never the question itself.
"""

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ActivityType, EngagementEventType, SenderType
from app.models import Candidate, CandidateActivity
from app.models.base import utcnow
from app.schemas.portal import CandidateAskResponse, CandidatePrep
from app.services.activity_service import record_activity
from app.services.ai.client import AIProvider
from app.services.ai.context import parse_requirements
from app.services.ai.portal_context import PortalContext, PortalInterviewFact
from app.services.ai.portal_fallback import TOPIC_LABELS, topic_of
from app.services.ai_service import with_fallback
from app.services.candidate_portal_service import PortalRecord, owned_application, require_record
from app.services.company_profile import company_profile
from app.services.engagement.events import record_unless_recent

# Repeat views and questions within this window are one timeline entry, not many.
REPEAT_WINDOW = timedelta(hours=1)


def build_portal_context(record: PortalRecord, *, utc_offset_minutes: int | None = None) -> PortalContext:
    candidate, job = record.candidate, record.job
    description = job.description or ""
    return PortalContext(
        first_name=candidate.first_name,
        location=candidate.location,
        headline=candidate.headline,
        skills=tuple(candidate.skills),
        company=record.company,
        company_overview=settings.organization_overview,
        company_profile=tuple(company_profile().facts()),
        job_title=job.title,
        job_department=job.department,
        job_location=job.location,
        employment_type=job.employment_type,
        hiring_manager=job.hiring_manager,
        job_summary=description.split("\n\n")[0].strip() or None,
        job_requirements=parse_requirements(description),
        stage_label=record.application.stage_label,
        status=record.application.status,
        next_step=record.application.next_step,
        interviews=tuple(
            PortalInterviewFact(
                title=interview.title,
                interview_type=interview.interview_type.value,
                scheduled_at=interview.scheduled_at,
                duration_minutes=interview.duration_minutes,
                interviewers=tuple(interview.interviewers),
                status=interview.status,
                upcoming=interview.upcoming,
                confirmed=interview.confirmed_at is not None,
                can_confirm=interview.can_confirm,
            )
            for interview in record.interviews
        ),
        activity=tuple(entry.title for entry in record.activity),
        messages=tuple(
            ("You" if message.sender_type == SenderType.CANDIDATE else message.sender_name, message.content)
            for message in record.messages
        ),
        recruiter_name=record.recruiter.name if record.recruiter else None,
        now=record.now,
        utc_offset_minutes=utc_offset_minutes,
    )


async def ask(
    session: AsyncSession,
    candidate: Candidate,
    question: str,
    provider: AIProvider,
    *,
    utc_offset_minutes: int | None = None,
    application_id: uuid.UUID | None = None,
) -> CandidateAskResponse:
    record = await require_record(session, candidate, application_id)
    context = build_portal_context(record, utc_offset_minutes=utc_offset_minutes)
    content, model_name = await with_fallback(provider, lambda p: p.assist_candidate(context, question))
    await _record_once(
        session, record.application.id, ActivityType.QUESTION_ASKED, f"Asked about {TOPIC_LABELS[topic_of(question)]}"
    )
    return CandidateAskResponse(answer=content.answer, model_name=model_name)


async def prepare(
    session: AsyncSession,
    candidate: Candidate,
    provider: AIProvider,
    *,
    utc_offset_minutes: int | None = None,
    application_id: uuid.UUID | None = None,
) -> CandidatePrep:
    record = await require_record(session, candidate, application_id)
    context = build_portal_context(record, utc_offset_minutes=utc_offset_minutes)
    content, model_name = await with_fallback(provider, lambda p: p.prepare_candidate(context))
    return CandidatePrep(
        # Company information is always the approved facts, whatever a model wrote.
        **content.model_dump(exclude={"company_info"}),
        company_info=context.company_facts,
        interview=record.next_interview,
        role=record.job.title,
        company=record.company,
        model_name=model_name,
    )


async def record_prep_viewed(
    session: AsyncSession, candidate: Candidate, application_id: uuid.UUID | None = None
) -> None:
    application = await owned_application(session, candidate, application_id)
    await record_unless_recent(session, candidate.id, EngagementEventType.PREP_VIEWED, application_id=application.id)
    await _record_once(session, application.id, ActivityType.PREP_VIEWED, "Viewed prep materials")
    await session.commit()  # the engagement event, when the timeline entry was a repeat


async def _record_once(
    session: AsyncSession, application_id: uuid.UUID, activity_type: ActivityType, title: str
) -> None:
    """Record a candidate action unless the same one was recorded within REPEAT_WINDOW."""
    now = utcnow()
    latest = await session.scalar(
        select(CandidateActivity)
        .where(CandidateActivity.application_id == application_id, CandidateActivity.activity_type == activity_type)
        .order_by(CandidateActivity.created_at.desc())
        .limit(1)
    )
    if latest is not None and latest.title == title and now - latest.created_at < REPEAT_WINDOW:
        return
    record_activity(session, application_id, activity_type, title, metadata={"via": "candidate_portal"}, at=now)
    await session.commit()
