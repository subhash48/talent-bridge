"""Verify the real Postgres identity query, including addresses Google did not verify."""

import json
import uuid

import pytest
from sqlalchemy import text

from app.services.account_service import find_auth_account
from tests.conftest import POSTGRES_URL

pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="needs TALENT_BRIDGE_TEST_POSTGRES_URL")


@pytest.mark.parametrize("provider,identity_email,verified,confirmed,expected", [
    ("google", "PERSON@example.com", True, True, True),
    ("google", "other@example.com", True, True, False),
    ("google", "person@example.com", False, True, False),
    ("github", "person@example.com", True, True, False),
    ("google", "person@example.com", True, False, False),
])
async def test_only_a_confirmed_matching_google_identity_proves_the_email(sessions, provider, identity_email, verified, confirmed, expected):
    id = uuid.uuid4()
    async with sessions() as session:
        await session.execute(text(
            "insert into auth.users (id, email, email_confirmed_at) values (:id, 'person@example.com',"
            " case when :confirmed then now() else null end)"
        ), {"id": id, "confirmed": confirmed})
        await session.execute(text(
            "insert into auth.identities (user_id, provider, identity_data) values (:id, :provider, cast(:data as jsonb))"
        ), {"id": id, "provider": provider, "data": json.dumps({"email": identity_email, "email_verified": verified})})
        account = await find_auth_account(session, auth_user_id=id)
        assert account is not None and account.email_verified is expected
