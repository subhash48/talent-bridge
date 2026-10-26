"""The communication SLA rules: what each one watches, its default threshold, and a recruiter's changes.

The defaults live here. A row in communication_rules (migrations 015 and 019) is a workspace's change to
one rule: switched off, or a different threshold. Each workspace has its own, so they're read and written
for the workspace the session is scoped to (core/tenancy.py); outside one, the defaults apply. health.py
applies them.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import CommunicationRuleKey
from app.core.tenancy import scoped_company
from app.models import CommunicationRule, User

K = CommunicationRuleKey

MAX_THRESHOLD_HOURS = 2160  # 90 days


@dataclass(frozen=True)
class RuleSpec:
    key: CommunicationRuleKey
    title: str  # what a recruiter sees on an attention item
    description: str  # what the rule watches, for the settings page
    default_hours: int
    unit: str  # what the threshold counts: "hours after the interview ended"


SPECS: dict[CommunicationRuleKey, RuleSpec] = {
    K.STAGE_UPDATE: RuleSpec(
        K.STAGE_UPDATE,
        "Status changed, candidate not told",
        "The application moved to a new stage and the candidate hasn't had a message since.",
        0,
        "hours after the stage change",
    ),
    K.UNANSWERED_QUESTION: RuleSpec(
        K.UNANSWERED_QUESTION,
        "Unanswered message",
        "The candidate wrote (anything but a thank-you note) and nobody has replied.",
        24,
        "hours after their message",
    ),
    K.POST_INTERVIEW: RuleSpec(
        K.POST_INTERVIEW,
        "Interview done, no follow-up",
        "An interview ended and the candidate hasn't heard from you since.",
        72,
        "hours after the interview ended",
    ),
    K.INTERVIEW_UNCONFIRMED: RuleSpec(
        K.INTERVIEW_UNCONFIRMED,
        "Interview not confirmed",
        "An interview is coming up and the candidate hasn't confirmed it. A reminder clears it.",
        24,
        "hours before the interview",
    ),
    K.NO_RECENT_UPDATE: RuleSpec(
        K.NO_RECENT_UPDATE,
        "No update in a while",
        "An active application has had no message from you, and no interview is booked.",
        120,
        "hours since the last update (or since they applied)",
    ),
}


@dataclass(frozen=True)
class Rule:
    spec: RuleSpec
    enabled: bool
    threshold_hours: int

    @property
    def key(self) -> CommunicationRuleKey:
        return self.spec.key

    @property
    def threshold(self) -> timedelta:
        return timedelta(hours=self.threshold_hours)


Rules = dict[CommunicationRuleKey, Rule]


def default_rules() -> Rules:
    return {key: Rule(spec, True, spec.default_hours) for key, spec in SPECS.items()}


async def load_rules(session: AsyncSession) -> Rules:
    """Every rule, with the workspace's changes applied."""
    company_id = scoped_company(session)
    rules = default_rules()
    if company_id is None:
        return rules
    query = select(CommunicationRule).where(CommunicationRule.company_id == company_id)
    changed = {row.key: row for row in await session.scalars(query)}
    for key, row in changed.items():
        rules[key] = Rule(SPECS[key], row.enabled, row.threshold_hours)
    return rules


async def update_rule(
    session: AsyncSession, key: CommunicationRuleKey, *, enabled: bool, threshold_hours: int, actor: User | None
) -> Rule:
    company_id = scoped_company(session)
    assert company_id is not None, "rules are changed in a workspace"
    for attempt in range(2):
        row = await session.get(CommunicationRule, (company_id, key))
        if row is None:
            row = CommunicationRule(company_id=company_id, key=key, enabled=enabled, threshold_hours=threshold_hours)
            session.add(row)
        row.enabled = enabled
        row.threshold_hours = threshold_hours
        row.updated_by = actor.id if actor else None
        try:
            await session.commit()
            break
        except IntegrityError:  # someone in the workspace changed the same rule first: update theirs
            await session.rollback()
            if attempt:
                raise
    return Rule(SPECS[key], enabled, threshold_hours)
