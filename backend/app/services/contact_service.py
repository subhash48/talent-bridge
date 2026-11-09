"""The public website's contact form: kept, and emailed to the right team when that's set up.

Every message is stored (contact_requests), so nothing sent is lost when email isn't configured. With an
email provider, it's also emailed to the business or support group, chosen here from the topic and never by
the browser, so the form can't be used to mail anyone else. The groups only receive: the email comes from
EMAIL_FROM with the visitor as Reply-To, and the team answers from their own inbox. Nothing is sent back to
the address the visitor typed. A filled-in hidden field marks an automated form filler, which is told it
worked and stored nothing. Each address sending too often in a short time is asked to wait (429).

The subject is kept at the top of the stored message rather than in a column of its own: the table needs no
change, so this works on a database as soon as the code is deployed.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ContactTopic, EmailStatus
from app.core.rate_limit import RateLimiter
from app.integrations.email import EmailProvider, OutboundEmail
from app.models import ContactRequest
from app.schemas.contact import ContactCreate

logger = logging.getLogger(__name__)

TOPIC_LABELS: dict[ContactTopic, str] = {
    ContactTopic.PRODUCT: "Product questions",
    ContactTopic.PILOT: "Pilot / design partnership",
    ContactTopic.SUPPORT: "Customer support",
    ContactTopic.PARTNERSHIPS: "Partnerships",
    ContactTopic.GENERAL: "Business inquiry",
}
# These go to support; everything else (business inquiries, partnerships, demo requests) goes to business.
SUPPORT_TOPICS = {ContactTopic.SUPPORT, ContactTopic.PRODUCT}
WINDOW_SECONDS = 600
PER_WINDOW = 5


limiter = RateLimiter(
    PER_WINDOW,
    WINDOW_SECONDS,
    "You've sent several messages just now. Please wait a few minutes and try again.",
    code="too_many_messages",
)


def recipient(topic: ContactTopic) -> str:
    return settings.contact_support_email if topic in SUPPORT_TOPICS else settings.contact_business_email


async def receive(session: AsyncSession, data: ContactCreate, email: EmailProvider, client: str) -> None:
    if data.website:  # the hidden field: not a person
        logger.info("contact.ignored reason=honeypot")
        return
    limiter.check(client)
    row = ContactRequest(
        name=data.name,
        email=data.email,
        company=data.company,
        topic=data.topic,
        message=f"Subject: {data.subject}\n\n{data.message}",
    )
    session.add(row)
    await session.flush()
    if email.configured:
        result = await email.send(
            OutboundEmail(
                to=recipient(data.topic),
                reply_to=data.email,
                subject=f"[{TOPIC_LABELS[data.topic]}] {data.subject}",
                text="\n".join(
                    [
                        f"From: {data.name} <{data.email}>",
                        f"Company: {data.company or 'not given'}",
                        f"Topic: {TOPIC_LABELS[data.topic]}",
                        "",
                        data.message,
                        "",
                        "--",
                        "Sent with the contact form on the Hirvello website. Replying goes straight to the sender.",
                    ]
                ),
                idempotency_key=f"contact-{row.id}",
            )
        )
        row.email_status = "sent" if result.status == EmailStatus.SENT else "failed"
    await session.commit()
    logger.info("contact.received topic=%s email_status=%s", data.topic, row.email_status)
