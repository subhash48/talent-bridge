"""A company's workspace: what its staff see of it, and an admin's changes to how it hires.

The mode only changes the interface (the full recruiting workspace or Simple Hire). The data, the
services and the rules about who sees what are the same either way.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.errors import ForbiddenError
from app.models import Company, User
from app.schemas.user import WorkspaceRead, WorkspaceUpdate

ADMINS_ONLY = "Only an admin can change your workspace's settings."


def present(company: Company, user: User) -> WorkspaceRead:
    return WorkspaceRead(
        id=company.id,
        name=company.name,
        mode=company.workspace_mode,
        location=company.locations[0] if company.locations else None,
        can_manage=user.role == UserRole.ADMIN,
    )


async def update(session: AsyncSession, company: Company, user: User, data: WorkspaceUpdate) -> WorkspaceRead:
    if user.role != UserRole.ADMIN:
        raise ForbiddenError(ADMINS_ONLY, code="admins_only")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name"):
        company.name = changes["name"]
    if changes.get("mode"):
        company.workspace_mode = changes["mode"]
    if "location" in changes:  # the first of the company's locations is where the business is
        rest = (company.locations or [])[1:]
        company.locations = [changes["location"], *rest] if changes["location"] else rest
    await session.commit()
    return present(company, user)
