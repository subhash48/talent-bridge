"""Link Supabase Auth accounts to the people in Talent Bridge. For operators, not the public.

    python -m app.db.accounts link EMAIL   link the Supabase Auth account with this email
    python -m app.db.accounts list         show who can sign in and who isn't linked yet

Create the account first in the Supabase dashboard (Authentication > Users > Add user). Linking
never changes a role: a recruiter or admin keeps the role their users row has, and a candidate gets
a users row with the candidate role, linked to their candidate record. To make someone staff, add
or update their users row in the database first; nothing on the public side can.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.database import dispose_engine, get_engine, get_sessionmaker
from app.models import Candidate, User
from app.services.account_service import AccountLinkError, find_auth_account, link_account


async def link(email: str) -> int:
    async with get_sessionmaker()() as session:
        if get_engine().dialect.name != "postgresql":
            print("Accounts can only be linked on Supabase Postgres: set DATABASE_URL in backend/.env.")
            return 1
        account = await find_auth_account(session, email=email)
        if account is None:
            print(f"No Supabase Auth account uses {email}. Add it under Authentication > Users first.")
            return 1
        try:
            user = await link_account(session, account.email, account.id)
        except AccountLinkError as exc:
            print(f"Not linked: {exc}")
            return 1
    print(f"Linked {user.email} ({user.full_name}) as {user.role.value}.")
    return 0


async def list_accounts() -> int:
    async with get_sessionmaker()() as session:
        users = (await session.scalars(select(User).order_by(User.role, User.email))).all()
        linked = {
            user_id: f"{first} {last}"
            for user_id, first, last in await session.execute(
                select(Candidate.user_id, Candidate.first_name, Candidate.last_name).where(
                    Candidate.user_id.is_not(None)
                )
            )
        }
    for user in users:
        status = "linked" if user.auth_user_id else "not linked"
        if user.disabled_at:
            status += ", disabled"
        person = f" -> candidate {linked[user.id]}" if user.id in linked else ""
        print(f"{user.role.value:<10} {user.email:<40} {status}{person}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Link Supabase Auth accounts to Talent Bridge users.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("link", help="link the Supabase Auth account with this email").add_argument("email")
    commands.add_parser("list", help="show every user and whether they can sign in")
    args = parser.parse_args()

    async def run() -> int:
        try:
            return await (link(args.email) if args.command == "link" else list_accounts())
        finally:
            await dispose_engine()

    sys.exit(asyncio.run(run()))


if __name__ == "__main__":
    main()
