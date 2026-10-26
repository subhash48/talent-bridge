"""Accounts people make for themselves (POST /accounts/*). Mirrors frontend/types/accounts.ts.

Passwords never come here: Supabase Auth keeps them, and verifies the email address. These only say
what the verified sign-in is in TalentBridge.
"""

from typing import Annotated, Literal

from pydantic import Field

from app.core.enums import WorkspaceMode
from app.schemas.common import APIModel, OptionalText

Name = Annotated[str, Field(min_length=1, max_length=100)]


class AccountStatus(APIModel):
    """What a signed-in Supabase account is in TalentBridge, so the frontend knows what to set up.

    account   candidate (a candidate portal), staff (an employer's workspace), or none yet
    """

    email: str | None
    email_verified: bool
    account: Literal["candidate", "staff", "none"]
    workspace_mode: WorkspaceMode | None = None  # staff with a workspace


class CandidateSignup(APIModel):
    """A candidate's own account, made on the TalentBridge website before or after applying anywhere."""

    first_name: Name
    last_name: Name


class WorkspaceSetup(APIModel):
    """An employer's workspace: their company, and how they want to hire. They become its admin."""

    full_name: Name
    company_name: Annotated[str, Field(min_length=1, max_length=120)]
    mode: WorkspaceMode
    location: OptionalText(200) = None  # where the business is; Simple Hire's jobs start there
