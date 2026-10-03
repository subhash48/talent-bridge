"""Identity and demo operations (ARCHITECTURE.md 8.4, 10.4).

Planned endpoints (prefix /v1):
    GET  /me
    POST /demo/reset    (DEMO_MODE only)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["auth"])
