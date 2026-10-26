from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.core.enums import UserRole, WorkspaceMode
from app.schemas.common import APIModel, OptionalText, Timestamp


class UserRead(APIModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    created_at: Timestamp


class WorkspaceRead(APIModel):
    """The company a recruiter or admin hires for, and how it hires. Mirrors frontend/types/workspace.ts."""

    id: UUID
    name: str
    mode: WorkspaceMode  # full: the recruiting workspace; simple: Simple Hire
    location: str | None = None  # where the business is: Simple Hire's new jobs start there
    can_manage: bool = False  # an admin, who may change the name, the location and the mode


class WorkspaceUpdate(APIModel):
    """PATCH /workspace, admins only. Only the fields sent change."""

    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    mode: WorkspaceMode | None = None
    location: OptionalText(200) = None


class CurrentUserRead(UserRead):
    organization: str
    candidate_id: UUID | None = None  # the candidate's own record; null for staff
    workspace: WorkspaceRead | None = None  # staff only: where they work, and so which interface opens
