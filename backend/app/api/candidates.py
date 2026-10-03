"""Candidates and the recruiter pipeline."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.dependencies import RecruiterDep, SessionDep
from app.core.enums import ApplicationStage
from app.schemas.candidate import CandidateCreate, CandidateDetail, CandidateListItem
from app.schemas.common import Page
from app.services import candidate_service

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=Page[CandidateListItem], summary="List the pipeline")
async def list_candidates(
    session: SessionDep,
    stage: ApplicationStage | None = None,
    job_id: UUID | None = None,
    search: Annotated[str | None, Query(max_length=100, description="Name, email, job, skill or location")] = None,
    include_archived: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[CandidateListItem]:
    """One row per application, most recent activity first. Archived applications are hidden
    unless include_archived is true."""
    return await candidate_service.list_pipeline(
        session,
        stage=stage,
        job_id=job_id,
        search=search,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )


@router.get("/{candidate_id}", response_model=CandidateDetail, summary="Get a candidate")
async def get_candidate(candidate_id: UUID, session: SessionDep, application_id: UUID | None = None) -> CandidateDetail:
    """The candidate with one application's stage, job, activity, interviews, messages, engagement
    and latest AI analysis. Defaults to their most recently updated application."""
    return await candidate_service.get_candidate_detail(session, candidate_id, application_id)


@router.post("", response_model=CandidateDetail, status_code=201, summary="Add a candidate")
async def create_candidate(body: CandidateCreate, session: SessionDep, user: RecruiterDep) -> CandidateDetail:
    """Creates the person and, when job_id is set, their application at the given stage."""
    return await candidate_service.create_candidate(session, body, user)
