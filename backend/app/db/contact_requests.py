"""Read what people sent with the website's contact form. For operators, not the public.

    python -m app.db.contact_requests                 the 20 newest messages, newest first
    python -m app.db.contact_requests --limit 50
    python -m app.db.contact_requests --not-emailed   only those the team hasn't had by email

Every message is kept (contact_requests), and emailed to CONTACT_EMAIL only when an email provider is set
up. Until it is, this is where they're read: each shows who sent it, their address to reply to, the topic,
and the message itself.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContactRequest
from app.services.contact_service import TOPIC_LABELS


async def newest(session: AsyncSession, limit: int, not_emailed: bool = False) -> list[ContactRequest]:
    statement = select(ContactRequest).order_by(ContactRequest.created_at.desc()).limit(limit)
    if not_emailed:
        statement = statement.where(ContactRequest.email_status != "sent")
    return list(await session.scalars(statement))


def describe(row: ContactRequest) -> str:
    """One message as the team reads it: when, who and how to reply, the topic, then what they wrote."""
    sender = f"{row.name} <{row.email}>" + (f", {row.company}" if row.company else "")
    emailed = {"sent": "emailed to the team", "failed": "couldn't be emailed"}.get(row.email_status, "not emailed")
    return "\n".join(
        [
            f"{row.created_at:%Y-%m-%d %H:%M} UTC  [{TOPIC_LABELS[row.topic]}]  {emailed}",
            f"From: {sender}",
            "",
            row.message,
        ]
    )


async def _main(limit: int, not_emailed: bool) -> int:
    from app.core.database import dispose_engine, get_sessionmaker

    try:
        async with get_sessionmaker()() as session:
            rows = await newest(session, limit, not_emailed)
    finally:
        await dispose_engine()
    if not rows:
        print("No messages yet." if not not_emailed else "Every message has been emailed to the team.")
        return 0
    print(("\n\n" + "-" * 72 + "\n\n").join(describe(row) for row in rows))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Read messages sent with the website's contact form.")
    parser.add_argument("--limit", type=int, default=20, help="how many of the newest to show (default 20)")
    parser.add_argument("--not-emailed", action="store_true", help="only those the team hasn't had by email")
    args = parser.parse_args()
    sys.exit(asyncio.run(_main(args.limit, args.not_emailed)))


if __name__ == "__main__":
    main()
