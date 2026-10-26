"""One draft per candidate, each from their own application: never one message for everyone."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.enums import DraftStatus
from app.models import Application, CommunicationDraft, Message
from app.schemas.ai import DraftPurpose
from app.services.ai.fallback import MockProvider
from app.services.communication.drafts import create_personal_drafts
from tests.conftest import application_id

SOPHIA = uuid.UUID(application_id("sophia-martinez"))
MAYA = uuid.UUID(application_id("maya-brooks"))
PROPOSED = "Interview: Design interview\nLength: 30 minutes\nProposed time: Tuesday 3 November, 1:00 PM–1:30 PM (UTC)."


async def test_each_candidate_gets_their_own_draft_and_nothing_is_sent(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with sessions() as session:
        applications = list(
            (
                await session.scalars(
                    select(Application)
                    .where(Application.id.in_([SOPHIA, MAYA]))
                    .options(selectinload(Application.candidate), selectinload(Application.job))
                )
            ).all()
        )
        applications.sort(key=lambda app: [SOPHIA, MAYA].index(app.id))
        messages = len((await session.scalars(select(Message.id))).all())
        written = await create_personal_drafts(
            session,
            applications,
            {SOPHIA: (DraftPurpose.INTERVIEW_PROPOSAL, PROPOSED), MAYA: (DraftPurpose.INTERVIEW_INVITATION, None)},
            MockProvider(),
            None,
        )
        assert [draft.application_id for draft in written] == [SOPHIA, MAYA]
        sophia, maya = written
        assert sophia.body.startswith("Hi Sophia,\n\nThanks again for your interest in the Product Designer role.")
        assert "invite you to a 30-minute design interview on Tuesday 3 November, 1:00 PM–1:30 PM (UTC)" in sophia.body
        assert "confirm it" in sophia.body and "reply here" in sophia.body
        # No time given, and Maya can't reply yet (her messaging is off): she's told times will follow.
        assert maya.body.startswith("Hi Maya,") and "I'll be in touch with some times shortly" in maya.body
        assert "reply" not in maya.body
        assert {draft.status for draft in written} == {DraftStatus.DRAFTED}
        assert len((await session.scalars(select(Message.id))).all()) == messages  # drafts only

        # A new batch replaces each application's open draft.
        again = await create_personal_drafts(
            session, applications[:1], {SOPHIA: (DraftPurpose.OUTREACH, None)}, MockProvider(), None
        )
        statuses = (
            await session.execute(
                select(CommunicationDraft.id, CommunicationDraft.status).where(
                    CommunicationDraft.application_id == SOPHIA
                )
            )
        ).all()
        assert dict(statuses)[sophia.id] == DraftStatus.DISCARDED and dict(statuses)[again[0].id] == DraftStatus.DRAFTED
