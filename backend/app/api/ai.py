"""AI gateway: chat over SSE and structured staff recipes (ARCHITECTURE.md 6.1, 6.9, 8.4).

The surface is derived from the principal's role; the client cannot choose it.

Planned endpoints (prefix /v1/ai):
    POST /chat    (SSE)
    GET  /conversations/{conversation_id}
    POST /candidate-summary
    POST /next-actions
    POST /draft-followup
    POST /interview-brief
    POST /feedback-summary
    POST /missing-info
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1/ai", tags=["ai"])
