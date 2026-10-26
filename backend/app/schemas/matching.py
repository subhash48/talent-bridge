"""Finding candidates against job-related criteria the recruiter chose (POST /candidates/match).

Every result says why it's there: which of the criteria the application shows, and where (the
candidate's listed skills, their headline or their résumé). There is no score, nothing hidden, and
nothing is decided: the recruiter picks who to contact. Mirrors frontend/types/matching.ts.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BeforeValidator, ConfigDict, Field

from app.core.enums import ApplicationStage, CommunicationStatus
from app.schemas.common import APIModel, Timestamp
from app.schemas.demo import clean_list

InterviewState = Literal["upcoming", "interviewed", "awaiting_update", "none"]
Criterion = Annotated[str, Field(min_length=1, max_length=60)]
Criteria = Annotated[list[Criterion], BeforeValidator(clean_list), Field(max_length=20)]
EvidenceSource = Literal["skills", "headline", "resume"]
SHORTLIST_SIZES = (5, 10, 20)


class MatchRequest(APIModel):
    """What to look for, and among whom. Only job-related criteria: skills and requirements, the job, the
    stage, where they are and where the recruiter's communication stands. Nothing personal can be asked."""

    model_config = ConfigDict(extra="forbid")

    job_ids: Annotated[list[UUID], Field(max_length=20)] = []
    skills: Criteria = []  # empty with job_ids: the jobs' own listed requirements
    stage: ApplicationStage | None = None
    location: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    interview: InterviewState | None = None
    communication: CommunicationStatus | None = None
    messaging: bool | None = None
    # Only these applications: the ones the Candidates page shows with its filters.
    application_ids: Annotated[list[UUID], Field(max_length=2000)] | None = None
    limit: Annotated[int, Field(ge=1, le=200)] = 10


class MatchEvidence(APIModel):
    criterion: str
    matched: bool
    source: EvidenceSource | None = None  # where it was found


class ExperienceNote(APIModel):
    """Years of relevant experience the application states, quoted: never inferred or scored."""

    label: str  # "4 years product design experience"
    source: EvidenceSource
    quote: str


class CandidateMatch(APIModel):
    application_id: UUID
    candidate_id: UUID
    name: str
    job_id: UUID
    job_title: str
    company_name: str
    stage: ApplicationStage
    location: str | None = None
    applied_at: Timestamp
    matched: int  # how many of the criteria the application shows
    evidence: list[MatchEvidence]  # one per criterion, in the order given
    experience: ExperienceNote | None = None


class MatchFilter(APIModel):
    key: str
    label: str  # as the recruiter sees it: "Job: Product Designer · Encord", "Stage: Screening"


class MatchResult(APIModel):
    criteria: list[str]
    criteria_source: Literal["recruiter", "job_requirements", "none"]
    filters: list[MatchFilter]  # every filter applied, besides the criteria
    considered: int  # applications the filters left
    matching: int  # of those, the ones showing at least one criterion (all of them with no criteria)
    limit: int
    items: list[CandidateMatch]  # the first `limit` of those
    order: str  # how the list is ordered, in words
