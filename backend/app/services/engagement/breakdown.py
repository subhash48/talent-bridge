"""The recruiter's engagement breakdown for one of a candidate's applications (GET
/candidates/{id}/engagement). Recruiter-only: the candidate portal never calls in here."""

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import EngagementEventType
from app.core.errors import NotFoundError
from app.models import Application, Candidate, CandidateEngagementEvent
from app.models.base import utcnow
from app.schemas.engagement import (
    CommunicationPart,
    EngagementBreakdown,
    PortalAccess,
    PortalActionRead,
    PortalActivityPart,
    PortalOverview,
    ResponsivenessPart,
)
from app.services.engagement.scoring import active_minutes, count_visits, score_engagement
from app.services.engagement.service import engagement_score, facts_for
from app.services.pipeline_service import load_snapshots

E = EngagementEventType
ACTION_LABELS = {
    E.PORTAL_LOGIN: "Signed in to the portal",
    E.APPLICATION_VIEWED: "Viewed their application",
    E.INTERVIEW_VIEWED: "Viewed interview details",
    E.PREP_VIEWED: "Opened interview prep",
    E.MESSAGE_READ: "Read your messages",
}
RECENT_ACTIONS = 6
RECENT_EVENTS_READ = 50  # enough to fill RECENT_ACTIONS once repeats are counted together


async def engagement_breakdown(
    session: AsyncSession,
    candidate_id: uuid.UUID,
    application_id: uuid.UUID | None = None,
    *,
    now: datetime | None = None,
) -> EngagementBreakdown:
    """For the application asked for (it must be the candidate's), else their most recent one."""
    now = now or utcnow()
    candidate = await session.scalar(
        select(Candidate)
        .where(Candidate.id == candidate_id)
        .options(selectinload(Candidate.applications))
        .execution_options(populate_existing=True)
    )
    if candidate is None:
        raise NotFoundError("Candidate not found.")
    applications: list[Application] = sorted(
        candidate.applications, key=lambda item: (item.archived_at is not None, -item.updated_at.timestamp())
    )
    if application_id is not None and not any(item.id == application_id for item in applications):
        raise NotFoundError("This application doesn't belong to the candidate.")
    snapshots = await load_snapshots(session, applications, with_engagement=True)
    focus = next(
        (snapshot for snapshot in snapshots if snapshot.application.id == application_id),
        snapshots[0] if snapshots else None,
    )

    overall = facts_for(snapshots, candidate)
    result = engagement_score(focus, candidate, now) if focus else score_engagement(overall, now)

    portal, responses, talk = result.portal_activity, result.responsiveness, result.communication
    recent = await session.scalars(
        select(CandidateEngagementEvent)
        .where(
            CandidateEngagementEvent.candidate_id == candidate.id,
            CandidateEngagementEvent.event_type.in_([event.value for event in ACTION_LABELS]),
        )
        .order_by(CandidateEngagementEvent.occurred_at.desc())
        .limit(RECENT_EVENTS_READ)
    )
    problem = candidate.portal_invite_error
    return EngagementBreakdown(
        candidate_id=candidate.id,
        application_id=focus.application.id if focus else None,
        score=result.score,
        label=result.label,
        level=result.level,
        sufficient_data=result.sufficient_data,
        portal_activity=PortalActivityPart(
            score=portal.score,
            max=portal.max,
            neutral=portal.neutral,
            sessions=portal.visits,
            active_minutes=portal.active_minutes,
            meaningful_views=portal.meaningful_views,
            last_active_at=portal.last_active_at,
        ),
        responsiveness=ResponsivenessPart(
            score=responses.score,
            max=responses.max,
            neutral=responses.neutral,
            response_opportunities=responses.response_opportunities,
            responses=responses.responses,
            pending=responses.pending,
            median_response_minutes=responses.median_response_minutes,
            last_response_minutes=responses.last_response_minutes,
        ),
        communication=CommunicationPart(
            score=talk.score,
            max=talk.max,
            initiated_messages=talk.initiated_messages,
            confirmations=talk.confirmations,
            confirmation_opportunities=talk.confirmation_opportunities,
            thank_you_notes=talk.thank_you_notes,
            follow_ups=talk.follow_ups,
        ),
        proactive_actions=result.proactive_actions,
        overall=PortalOverview(
            visits=count_visits(overall.sessions),
            active_minutes=active_minutes(overall.sessions),
            last_active_at=max((row.last_active_at for row in overall.sessions), default=None),
        ),
        portal_access=PortalAccess(
            status=candidate.portal_status,
            invited_at=candidate.portal_invited_at,
            activated_at=candidate.portal_activated_at,
            problem=problem,
        ),
        recent_portal_activity=recent_actions(recent),
        formula_version=result.version,
    )


def recent_actions(events: Iterable[CandidateEngagementEvent]) -> list[PortalActionRead]:
    """Newest first, with a run of the same action (signing in three times) shown once, counted."""
    actions: list[PortalActionRead] = []
    for event in events:
        label = ACTION_LABELS[EngagementEventType(event.event_type)]
        if actions and actions[-1].label == label:
            actions[-1].count += 1
        elif len(actions) == RECENT_ACTIONS:
            break
        else:
            actions.append(PortalActionRead(label=label, occurred_at=event.occurred_at))
    return actions
