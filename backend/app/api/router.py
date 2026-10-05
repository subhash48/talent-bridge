"""Every versioned route, mounted under /api/v1 by main.py, with the role each one requires.

Access is enforced here and in the backend only: hiding a page in the frontend protects nothing.
"""

from fastapi import APIRouter, Depends

from app.api import (
    activities,
    ai,
    analytics,
    applications,
    assistant,
    auth,
    candidate,
    candidate_engagement,
    candidates,
    dashboard,
    demo_careers,
    demo_jobs,
    demo_resumes,
    engagement,
    integrations,
    interviews,
    jobs,
    messages,
)
from app.core.dependencies import require_candidate, require_demo_enabled, require_recruiter

api_router = APIRouter()
# The recruiter workspace: recruiters and admins.
for module in (
    candidates,
    engagement,
    applications,
    activities,
    interviews,
    jobs,
    messages,
    ai,
    dashboard,
    analytics,
    assistant,
):
    api_router.include_router(module.router, dependencies=[Depends(require_recruiter)])
# The candidate portal: the signed-in candidate, scoped to their own record.
for module in (candidate, candidate_engagement):
    api_router.include_router(module.router, dependencies=[Depends(require_candidate)])
# Guarded route by route: /me is for anyone signed in; the Ashby webhook checks Ashby's signature
# and the other Ashby routes require a recruiter.
api_router.include_router(auth.router)
api_router.include_router(integrations.router)
# Development only (ENABLE_ASHBY_DEMO=true, never in production). The flag is checked first, so
# elsewhere these answer 404 to everyone: demo jobs and résumés for recruiters, and the public demo
# careers site.
for module in (demo_jobs, demo_resumes):
    api_router.include_router(module.router, dependencies=[Depends(require_demo_enabled), Depends(require_recruiter)])
api_router.include_router(demo_careers.router, dependencies=[Depends(require_demo_enabled)])
