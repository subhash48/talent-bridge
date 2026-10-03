"""Every versioned route, mounted under /api/v1 by main.py, with the role each one requires.

Access is enforced here and in the backend only: hiding a page in the frontend protects nothing.
"""

from fastapi import APIRouter, Depends

from app.api import (
    activities,
    ai,
    applications,
    auth,
    candidate,
    candidates,
    dashboard,
    integrations,
    interviews,
    jobs,
    messages,
)
from app.core.dependencies import require_candidate, require_recruiter

api_router = APIRouter()
# The recruiter workspace: recruiters and admins.
for module in (candidates, applications, activities, interviews, jobs, messages, ai, dashboard):
    api_router.include_router(module.router, dependencies=[Depends(require_recruiter)])
# The candidate portal: the signed-in candidate, scoped to their own record.
api_router.include_router(candidate.router, dependencies=[Depends(require_candidate)])
# Guarded route by route: /me is for anyone signed in, the Ashby webhook checks Ashby's signature.
api_router.include_router(auth.router)
api_router.include_router(integrations.router)
