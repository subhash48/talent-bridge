"""The signed-in recruiter's workspace: its company, and how it hires."""

from fastapi import APIRouter

from app.core.dependencies import SessionDep, WorkspaceDep
from app.schemas.user import WorkspaceRead, WorkspaceUpdate
from app.services import workspace_service

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("", response_model=WorkspaceRead, summary="Your workspace")
async def get_workspace(workspace: WorkspaceDep) -> WorkspaceRead:
    return workspace_service.present(workspace.company, workspace.user)


@router.patch("", response_model=WorkspaceRead, summary="Change your workspace")
async def update_workspace(body: WorkspaceUpdate, workspace: WorkspaceDep, session: SessionDep) -> WorkspaceRead:
    """Admins only (403 admins_only): the company's name, where it is, and how it hires (full or simple).
    Switching the mode changes the interface its staff see; nothing in the data changes."""
    return await workspace_service.update(session, workspace.company, workspace.user, body)
