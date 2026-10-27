"""The public website's contact form: kept, and emailed to the team when that's set up.

Every message is stored (contact_requests), so nothing sent is lost when email isn't configured. With an
email provider and CONTACT_EMAIL both set, it's also emailed there, with the sender as reply-to in the
text: the team answers from their own inbox. A filled-in hidden field marks an automated form filler,
which is told it worked and stored nothing. Each address sending too often in a short time is asked to
wait (429).
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ContactTopic, EmailStatus
from app.core.rate_limit import RateLimiter
from app.integrations.email import EmailProvider, OutboundEmail
from app.models import ContactRequest
from app.schemas.contact import ContactCreate, ContactInfo

logger = logging.getLogger(__name__)

TOPIC_LABELS: dict[ContactTopic, str] = {
    ContactTopic.PRODUCT: "Product questions",
    ContactTopic.PILOT: "Pilot / design partnership",
    ContactTopic.SUPPORT: "Support",
    ContactTopic.PARTNERSHIPS: "Partnerships",
    ContactTopic.GENERAL: "General inquiry",
}
WINDOW_SECONDS = 600
PER_WINDOW = 5


limiter = RateLimiter(
    PER_WINDOW,
    WINDOW_SECONDS,
    "You've sent several messages just now. Please wait a few minutes and try again.",
    code="too_many_messages",
)


def info() -> ContactInfo:
    return ContactInfo(email=settings.contact_email, topics=list(ContactTopic))


async def receive(session: AsyncSession, data: ContactCreate, email: EmailProvider, client: str) -> None:
    if data.website:  # the hidden field: not a person
        logger.info("contact.ignored reason=honeypot")
        return
    limiter.check(client)
    row = ContactRequest(
        name=data.name, email=data.email, company=data.company, topic=data.topic, message=data.message.strip()
    )
    session.add(row)
    await session.flush()
    if email.configured and settings.contact_email:
        result = await email.send(
            OutboundEmail(
                to=settings.contact_email,
                subject=f"[{TOPIC_LABELS[data.topic]}] {data.name}" + (f", {data.company}" if data.company else ""),
                text="\n".join(
                    [
                        f"From: {data.name} <{data.email}>",
                        f"Company: {data.company or 'not given'}",
                        f"Topic: {TOPIC_LABELS[data.topic]}",
                        "",
                        data.message.strip(),
                        "",
                        "--",
                        "Sent with the contact form on the Kavuntra website. Reply to the address above.",
                    ]
                ),
                idempotency_key=f"contact-{row.id}",
            )
        )
        row.email_status = "sent" if result.status == EmailStatus.SENT else "failed"
    await session.commit()
    logger.info("contact.received topic=%s email_status=%s", data.topic, row.email_status)
