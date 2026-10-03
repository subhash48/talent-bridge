"""Staff façade: jobs (ARCHITECTURE.md 8.2). Guard: require_staff.

Planned endpoints (prefix /v1/jobs):
    GET   /
    POST  /
    GET   /{job_id}
    PATCH /{job_id}
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])
