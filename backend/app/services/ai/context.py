"""Context builders: typed, cited blocks for each AI surface (ARCHITECTURE.md 6.3, 6.4).

The candidate builder reads portal projections only, so internal data can never reach the model.
"""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Principal


@dataclass(frozen=True)
class ContextBlock:
    source_type: str  # application | event | message | knowledge | interviewer
    source_id: str
    label: str  # rendered as a source chip
    text: str


async def build_staff_context(
    session: AsyncSession, principal: Principal, application_id: UUID
) -> list[ContextBlock]:
    raise NotImplementedError  # TODO: full record, events, insights, notes, feedback


async def build_candidate_context(
    session: AsyncSession, principal: Principal, application_id: UUID
) -> list[ContextBlock]:
    raise NotImplementedError  # TODO: portal projection, public interviewer fields, knowledge
