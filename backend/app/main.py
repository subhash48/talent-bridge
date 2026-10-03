"""Talent Bridge API: the backend for the recruiter workspace.

Routes live under /api/v1; /health is the liveness check and /docs the interactive API reference.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import API_PREFIX, settings
from app.core.database import dispose_engine, get_engine, init_database
from app.core.errors import register_error_handlers
from app.services.ai.client import get_ai_provider

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await init_database()
    yield
    await dispose_engine()


app = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)

register_error_handlers(app)  # before CORS, so error responses carry CORS headers too
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=API_PREFIX)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok", "database": get_engine().dialect.name, "ai_provider": get_ai_provider().name}
