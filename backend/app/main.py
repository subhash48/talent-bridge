"""HireMesh API entrypoint: CORS, router wiring and liveness (ARCHITECTURE.md 8, 18)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    applications,
    auth,
    candidate,
    engagement,
    events,
    interviews,
    jobs,
    messages,
    recruiter,
)
from app.core.config import settings

app = FastAPI(title="HireMesh API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    auth,
    recruiter,
    candidate,
    jobs,
    applications,
    interviews,
    messages,
    events,
    engagement,
    ai,
):
    app.include_router(module.router)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
