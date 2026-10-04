"""The portal's activity reports: visits, heartbeats and explicit actions. Candidate-only.

The candidate is always the signed-in one; the application named must be theirs (404 otherwise),
and only CLIENT_ENGAGEMENT_EVENTS are accepted. Nothing comes back but 204: what the recruiter makes
of it is never shown to the candidate.
"""

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.core.dependencies import CurrentCandidateDep, SessionDep
from app.core.enums import EngagementEventType
from app.models import Interview
from app.schemas.engagement import EngagementEventBatch, PortalVisitIn
from app.services.candidate_portal_service import owned_application
from app.services.engagement import sessions
from app.services.engagement.events import record_unless_recent

router = APIRouter(prefix="/candidate/engagement", tags=["candidate portal"])


@router.post("/sessions", status_code=204, summary="A portal visit started")
async def start(body: PortalVisitIn, request: Request, session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    application = await owned_application(session, candidate, body.application_id)
    await sessions.start_session(
        session,
        candidate.id,
        application.id,
        body.session_id,
        auth_session_id=getattr(request.state, "auth_session_id", None),
    )
    return Response(status_code=204)


@router.post("/heartbeat", status_code=204, summary="Still here and active")
async def heartbeat(body: PortalVisitIn, session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    """Sent only while the tab is visible and in use. The server times the gap itself."""
    application = await owned_application(session, candidate, body.application_id)
    await sessions.heartbeat(session, candidate.id, application.id, body.session_id)
    return Response(status_code=204)


@router.post("/sessions/end", status_code=204, summary="The visit ended")
async def end(body: PortalVisitIn, session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    """Best effort (the tab may close first); heartbeats are what count."""
    application = await owned_application(session, candidate, body.application_id)
    await sessions.heartbeat(session, candidate.id, application.id, body.session_id, end=True)
    return Response(status_code=204)


@router.post("/events", status_code=204, summary="Portal actions")
async def events(body: EngagementEventBatch, session: SessionDep, candidate: CurrentCandidateDep) -> Response:
    """A batch of page and feature views. Repeats within a few minutes are dropped."""
    for event in body.events:
        application = await owned_application(session, candidate, event.application_id)
        target: str | None = None
        if event.type == EngagementEventType.INTERVIEW_VIEWED:
            if event.interview_id is None or not await session.scalar(
                select(Interview.id).where(Interview.id == event.interview_id, Interview.application_id == application.id)
            ):
                continue  # not one of this application's interviews
            target = str(event.interview_id)
        elif event.type == EngagementEventType.PAGE_VIEW:
            target = event.page.value if event.page else None
        visit = (
            await sessions.visit_row_id(session, candidate.id, application.id, event.session_id)
            if event.session_id
            else None
        )
        recorded = await record_unless_recent(
            session,
            candidate.id,
            event.type,
            application_id=application.id,
            target=target,
            session_id=visit,
            source="candidate_portal",
        )
        if recorded and visit and event.type == EngagementEventType.PAGE_VIEW:
            await sessions.add_page_view(session, visit)
    await session.commit()
    return Response(status_code=204)
