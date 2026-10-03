from uuid import UUID

from app.core.enums import UserRole
from app.schemas.common import APIModel, Timestamp


class UserRead(APIModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    created_at: Timestamp


class CurrentUserRead(UserRead):
    organization: str
    candidate_id: UUID | None = None  # the candidate's own record; null for staff
