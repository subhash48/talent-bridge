"""Applicants' contact details, for the employer they applied to.

"Give me the phone numbers of these three" shows, for the applications the employer picked (named or
ticked), what each applicant gave with that application: the phone number and the email they applied
with. Only applications in the employer's own workspace exist here (the session is scoped), and nothing is
looked up anywhere else: someone who gave no phone number has none to show. Every look is recorded on the
application's timeline for the hiring team (internal: the candidate never sees it).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ActivityType
from app.core.errors import NotFoundError
from app.models import Application, User
from app.schemas.assistant import ContactCard, ContactItem
from app.services.activity_service import record_activity


async def for_applications(session: AsyncSession, application_ids: list[uuid.UUID], actor: User) -> ContactCard:
    ids = list(dict.fromkeys(application_ids))
    applications = {
        app.id: app
        for app in await session.scalars(
            select(Application)
            .where(Application.id.in_(ids))
            .options(selectinload(Application.candidate), selectinload(Application.job))
        )
    }
    if len(applications) != len(ids):
        raise NotFoundError("Application not found.")
    items = []
    for application_id in ids:
        app = applications[application_id]
        record_activity(
            session,
            app.id,
            ActivityType.CONTACT_DETAILS_VIEWED,
            "Contact details viewed",
            metadata={"by": actor.full_name},
        )
        items.append(
            ContactItem(
                application_id=app.id,
                candidate_id=app.candidate_id,
                name=app.candidate.full_name,
                job_title=app.job.title,
                phone=app.phone,
                email=app.candidate.email,
            )
        )
    await session.commit()
    return ContactCard(items=items)


def reply(card: ContactCard) -> str:
    missing = [item.name for item in card.items if not item.phone]
    lead = (
        "Here's the phone number they gave when they applied."
        if len(card.items) == 1
        else f"Here are the phone numbers these {len(card.items)} applicants gave when they applied."
    )
    if missing:
        names = missing[0] if len(missing) == 1 else f"{', '.join(missing[:-1])} and {missing[-1]}"
        lead += f" {names} didn't give one; you can still message them here."
    return lead + " Use them to contact them about this job only."
