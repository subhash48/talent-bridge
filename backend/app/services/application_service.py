"""Stage changes and archiving.

Every stage change updates the application, appends to candidate_stage_history and records a
timeline entry, all in one transaction. Only people change stages; the AI never does.
"""

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ActivityType, ApplicationStage
from app.core.errors import BadRequestError, InvalidStageTransitionError
from app.models import Application, CandidateStageHistory, User
from app.models.base import utcnow
from app.schemas.candidate import CandidateListItem
from app.services.activity_service import record_activity
from app.services.pipeline_service import build_list_items, get_application

S = ApplicationStage

# Where an application can go from each stage. Moving back is allowed, Hired needs an Offer
# first and is final, and a rejected application can only be reopened at an early stage.
ALLOWED_TRANSITIONS: dict[ApplicationStage, frozenset[ApplicationStage]] = {
    S.SOURCED: frozenset({S.SCREENING, S.INTERVIEW, S.OFFER, S.REJECTED}),
    S.SCREENING: frozenset({S.SOURCED, S.INTERVIEW, S.OFFER, S.REJECTED}),
    S.INTERVIEW: frozenset({S.SOURCED, S.SCREENING, S.OFFER, S.REJECTED}),
    S.OFFER: frozenset({S.SOURCED, S.SCREENING, S.INTERVIEW, S.HIRED, S.REJECTED}),
    S.HIRED: frozenset(),
    S.REJECTED: frozenset({S.SOURCED, S.SCREENING}),
}

# Stages a new application can start in.
INITIAL_STAGES = frozenset({S.SOURCED, S.SCREENING, S.INTERVIEW, S.OFFER})


def check_transition(name: str, current: ApplicationStage, target: ApplicationStage) -> None:
    if target == current:
        raise InvalidStageTransitionError(f"{name} is already in {current.label}.")
    if target in ALLOWED_TRANSITIONS[current]:
        return
    if current == S.HIRED:
        message = f"{name} has been hired, which is a final stage."
    elif target == S.HIRED:
        message = f"Move {name} to Offer before marking them as Hired."
    elif current == S.REJECTED:
        message = f"{name} was rejected. Reopen the application at Sourced or Screening."
    else:
        message = f"{name} can't move from {current.label} to {target.label}."
    raise InvalidStageTransitionError(message, details={"from": current, "to": target})


def check_initial_stage(stage: ApplicationStage) -> None:
    if stage not in INITIAL_STAGES:
        raise InvalidStageTransitionError(
            "New candidates start at Sourced, Screening, Interview or Offer.", details={"to": stage}
        )


def record_stage(
    session: AsyncSession,
    application: Application,
    previous: ApplicationStage | None,
    actor: User | None,
    at: datetime,
) -> None:
    session.add(
        CandidateStageHistory(
            application_id=application.id,
            previous_stage=previous,
            new_stage=application.stage,
            changed_by=actor.id if actor else None,
            changed_at=at,
        )
    )


async def change_stage(
    session: AsyncSession,
    application_id: uuid.UUID,
    stage: ApplicationStage,
    actor: User | None,
    *,
    reason: str | None = None,
) -> CandidateListItem:
    application = await get_application(session, application_id, for_update=True)
    name = application.candidate.first_name
    if application.archived_at is not None:
        raise BadRequestError(
            f"Restore {name} to the pipeline before changing their stage.", code="application_archived"
        )
    check_transition(name, application.stage, stage)

    now = utcnow()
    previous = application.stage
    application.stage = stage
    application.updated_at = now
    record_stage(session, application, previous, actor, now)
    record_activity(
        session,
        application.id,
        ActivityType.STAGE_CHANGED,
        f"Moved to {stage.label}",
        description=reason,
        metadata={"from": previous, "to": stage, "changed_by": actor.full_name if actor else None},
        at=now,
    )
    await session.commit()
    return (await build_list_items(session, [application], now))[0]


async def archive(session: AsyncSession, application_id: uuid.UUID, actor: User | None) -> CandidateListItem:
    """Take the application out of the active pipeline. Its history is kept. Idempotent."""
    application = await get_application(session, application_id, for_update=True)
    now = utcnow()
    if application.archived_at is None:
        application.archived_at = now
        application.updated_at = now
        record_activity(
            session,
            application.id,
            ActivityType.APPLICATION_ARCHIVED,
            "Archived",
            metadata={"by": actor.full_name if actor else None},
            at=now,
        )
        await session.commit()
    return (await build_list_items(session, [application], now))[0]


async def restore(session: AsyncSession, application_id: uuid.UUID, actor: User | None) -> CandidateListItem:
    """Put an archived application back in the pipeline, at the stage it was in. Idempotent."""
    application = await get_application(session, application_id, for_update=True)
    now = utcnow()
    if application.archived_at is not None:
        application.archived_at = None
        application.updated_at = now
        record_activity(
            session,
            application.id,
            ActivityType.APPLICATION_RESTORED,
            "Restored to pipeline",
            metadata={"by": actor.full_name if actor else None},
            at=now,
        )
        await session.commit()
    return (await build_list_items(session, [application], now))[0]
