"""Communication health for the recruiter workspace: one application's, every pipeline row's, and the
Needs Attention list. Rules are loaded once per request; the checks are health.assess."""

import uuid
from collections import Counter
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import CommunicationRuleKey, CommunicationStatus, DraftStatus
from app.models import Application, CommunicationDraft, User
from app.models.base import utcnow
from app.schemas.common import CandidateRef
from app.schemas.communication import (
    AttentionItem,
    AttentionList,
    AttentionRead,
    CommunicationHealthRead,
    CommunicationRuleRead,
    DraftRead,
)
from app.services.communication import rules as rule_store
from app.services.communication.health import Health, assess
from app.services.communication.present import candidate_status, draft_read, health_read
from app.services.communication.rules import Rule, Rules
from app.services.engagement.snapshot import ApplicationSnapshot
from app.services.pipeline_service import get_application, load_snapshots


def rule_read(rule: Rule) -> CommunicationRuleRead:
    spec = rule.spec
    return CommunicationRuleRead(
        key=spec.key,
        title=spec.title,
        description=spec.description,
        unit=spec.unit,
        enabled=rule.enabled,
        threshold_hours=rule.threshold_hours,
        default_hours=spec.default_hours,
    )


async def list_rules(session: AsyncSession) -> list[CommunicationRuleRead]:
    return [rule_read(rule) for rule in (await rule_store.load_rules(session)).values()]


async def update_rule(
    session: AsyncSession, key: CommunicationRuleKey, enabled: bool, threshold_hours: int, actor: User | None
) -> CommunicationRuleRead:
    rule = await rule_store.update_rule(session, key, enabled=enabled, threshold_hours=threshold_hours, actor=actor)
    return rule_read(rule)


async def open_drafts(session: AsyncSession, application_ids: list[uuid.UUID] | None = None) -> list[DraftRead]:
    query = select(CommunicationDraft).where(CommunicationDraft.status == DraftStatus.DRAFTED)
    if application_ids is not None:
        query = query.where(CommunicationDraft.application_id.in_(application_ids))
    rows = await session.scalars(query.order_by(CommunicationDraft.created_at))
    return [draft_read(row) for row in rows]


async def application_health(
    session: AsyncSession, application_id: uuid.UUID, now: datetime | None = None
) -> CommunicationHealthRead:
    now = now or utcnow()
    application = await get_application(session, application_id)
    [snapshot] = await load_snapshots(session, [application])
    return health_read(application, assess(snapshot, await rule_store.load_rules(session), now), now)


async def assess_all(
    session: AsyncSession, applications: Sequence[Application], now: datetime, rules: Rules | None = None
) -> list[tuple[ApplicationSnapshot, Health]]:
    """Applications must have their candidate and job loaded."""
    rules = rules or await rule_store.load_rules(session)
    snapshots = await load_snapshots(session, applications)
    return [(snapshot, assess(snapshot, rules, now)) for snapshot in snapshots]


async def pipeline_applications(session: AsyncSession) -> list[Application]:
    """Every application in the active pipeline (not archived), with its candidate and job."""
    rows = await session.scalars(
        select(Application)
        .where(Application.archived_at.is_(None))
        .options(selectinload(Application.candidate), selectinload(Application.job))
    )
    return list(rows)


async def attention_list(session: AsyncSession, now: datetime | None = None) -> AttentionList:
    now = now or utcnow()
    assessed = await assess_all(session, await pipeline_applications(session), now)
    items: list[tuple[datetime, AttentionItem]] = []
    counts: Counter[CommunicationRuleKey] = Counter()
    upcoming = 0
    for snapshot, health in assessed:
        if health.status == CommunicationStatus.DUE_SOON:
            upcoming += 1
        if not health.attention:
            continue
        application = snapshot.application
        counts.update(item.rule for item in health.attention)
        item = AttentionItem(
            candidate=CandidateRef(
                application_id=application.id,
                candidate_id=application.candidate.id,
                full_name=application.candidate.full_name,
                avatar_url=application.candidate.avatar_url,
                job_title=application.job.title,
            ),
            stage=application.stage,
            candidate_status=candidate_status(application),
            last_update_at=health.last_update_at,
            days_since_update=health.days_since_update(now),
            reasons=[AttentionRead.model_validate(reason) for reason in health.attention],
        )
        items.append((min(reason.due_at for reason in health.attention), item))
    items.sort(key=lambda pair: pair[0])
    drafts = {
        draft.application_id: draft
        for draft in await open_drafts(session, [item.candidate.application_id for _, item in items])
    }
    return AttentionList(
        items=[item.model_copy(update={"draft": drafts.get(item.candidate.application_id)}) for _, item in items],
        counts=dict(counts),
        upcoming=upcoming,
    )
