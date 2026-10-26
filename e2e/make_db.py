"""Create the end-to-end database from nothing: Supabase's auth.users (the part the backend reads), then every
migration in supabase/migrations in order, as a real deployment gets them.

    E2E_ADMIN_URL=postgresql://postgres@127.0.0.1:5432/postgres python e2e/make_db.py

It drops and recreates the database named by E2E_DB_NAME (default tb_e2e) on that server: never point it at a
server whose tb_e2e you need.
"""

import asyncio
import os
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
ADMIN = os.environ.get("E2E_ADMIN_URL", "postgresql://postgres@127.0.0.1:5432/postgres")
NAME = os.environ.get("E2E_DB_NAME", "tb_e2e")
AUTH = """
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz, invited_at timestamptz, deleted_at timestamptz, last_sign_in_at timestamptz);
"""


async def main() -> None:
    admin = await asyncpg.connect(ADMIN)
    await admin.execute(f'drop database if exists "{NAME}" with (force)')
    await admin.execute(f'create database "{NAME}"')
    await admin.close()
    db = await asyncpg.connect(ADMIN.rsplit("/", 1)[0] + f"/{NAME}")
    await db.execute(AUTH)
    for path in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
        async with db.transaction():
            await db.execute(path.read_text(encoding="utf-8"))
    await db.close()
    print(f"{NAME}: every migration applied")


asyncio.run(main())
