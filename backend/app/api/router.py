"""Every versioned route, mounted under /api/v1 by main.py, with the role each one requires.

Access is enforced here and in the backend only: hiding a page in the frontend protects nothing.
"""

from fastapi import APIRouter, Depends

from app.api import (
    activities,
    ai,
    applications,
    assistant,
    auth,
    candidate,
    candidates,
    careers,
    communication,
    dashboard,
    demo_careers,
    demo_jobs,
    demo_resumes,
    integrations,
    interviews,
    jobs,
    messages,
    portal_access,
    resumes,
    workspace,
)
from app.core.dependencies import require_candidate, require_demo_enabled, require_workspace

api_router = APIRouter()
# The recruiter workspace: recruiters and admins, each scoped to their own company's workspace.
for module in (
    candidates,
    portal_access,
    applications,
    communication,
    activities,
    interviews,
    jobs,
    messages,
    ai,
    dashboard,
    assistant,
    resumes,
    workspace,
):
    api_router.include_router(module.router, dependencies=[Depends(require_workspace)])
# The candidate portal: the signed-in candidate, scoped to their own record.
for module in (candidate,):
    api_router.include_router(module.router, dependencies=[Depends(require_candidate)])
# Guarded route by route: /me is for anyone signed in; the Ashby webhook checks Ashby's signature
# and the other Ashby routes require a recruiter.
api_router.include_router(auth.router)
# TalentBridge's careers site: public, no sign-in.
api_router.include_router(careers.router)
api_router.include_router(integrations.router)
# Development only (ENABLE_ASHBY_DEMO=true, never in production). The flag is checked first, so
# elsewhere these answer 404 to everyone: demo jobs and résumés for recruiters, and the public demo
# careers site.
for module in (demo_jobs, demo_resumes):
    api_router.include_router(module.router, dependencies=[Depends(require_demo_enabled), Depends(require_workspace)])
api_router.include_router(demo_careers.router, dependencies=[Depends(require_demo_enabled)])
