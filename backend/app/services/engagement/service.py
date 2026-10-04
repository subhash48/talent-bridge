"""From records to engagement: the facts the score reads, and the summary on each pipeline row.

Pure functions over loaded snapshots. Recruiter-only: the candidate portal never calls in here.
"""

from collections.abc import Sequence
from datetime import datetime

from app.models import Candidate, PortalSession
from app.schemas.candidate import EngagementRead
from app.services.engagement.responses import InterviewFact, MessageFact
from app.services.engagement.scoring import EngagementFacts, EngagementScore, SessionFact, ViewFact, score_engagement
from app.services.engagement.snapshot import ApplicationSnapshot
from app.services.orchestration import next_actions


def portal_since(candidate: Candidate, sessions: Sequence[PortalSession]) -> datetime | None:
    """When the candidate could first use the portal: activation, or their first visit if earlier."""
    times = [candidate.portal_activated_at, *(session.started_at for session in sessions)]
    return min((time for time in times if time is not None), default=None)


def facts_for(snapshots: Sequence[ApplicationSnapshot], candidate: Candidate) -> EngagementFacts:
    """One application's facts (one snapshot) or the candidate's overall (all of them)."""
    sessions = [row for snapshot in snapshots for row in snapshot.sessions]
    return EngagementFacts(
        sessions=[
            SessionFact(row.client_session_id, row.started_at, row.last_active_at, row.active_seconds)
            for row in sessions
        ],
        views=[
            ViewFact(event.event_type, (event.meta or {}).get("target"), event.occurred_at)
            for snapshot in snapshots
            for event in snapshot.engagement_events
        ],
        threads=[
            [MessageFact(message.sender_type, message.kind, message.created_at) for message in snapshot.messages]
            for snapshot in snapshots
        ],
        interviews=[
            InterviewFact(interview.created_at, interview.scheduled_at, interview.status, interview.confirmed_at)
            for snapshot in snapshots
            for interview in snapshot.interviews
        ],
        portal_since=portal_since(candidate, sessions),
    )


def engagement_score(snapshot: ApplicationSnapshot, candidate: Candidate, now: datetime) -> EngagementScore:
    return score_engagement(facts_for([snapshot], candidate), now)


def engagement_read(snapshot: ApplicationSnapshot, candidate: Candidate, now: datetime) -> EngagementRead:
    """The pipeline row's summary: level and score, and any follow-up the recruiter owes (a process
    rule, not engagement)."""
    score = engagement_score(snapshot, candidate, now)
    action = next_actions.evaluate(snapshot, now)
    return EngagementRead(
        level=score.level,
        score=score.score,
        label=score.label,
        last_active_at=score.portal_activity.last_active_at,
        follow_up_reason=action.reason if action.follow_up else None,
    )
