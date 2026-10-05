"""Voluntary demographic information: the candidate's own answers, and the aggregates recruiters see.

No recruiter schema has a field for an individual's answers, and the aggregates carry no candidate
id, name or email. Mirrors frontend/types/demographics.ts.
"""

from pydantic import ConfigDict

from app.core.enums import DisabilityStatus, RaceEthnicity, Region, SexualOrientation
from app.schemas.common import APIModel, Timestamp

DEMOGRAPHICS_NOTE = (
    "Voluntary and optional. Reported only in aggregate, with groups smaller than {k} combined or hidden, to "
    "understand and improve the candidate experience. Individual answers are never shown and never used in "
    "hiring decisions."
)


class DemographicAnswers(APIModel):
    """Every question is optional: null is unanswered, and each has its own prefer_not_to_say."""

    model_config = ConfigDict(extra="forbid")

    region: Region | None = None
    race_ethnicity: RaceEthnicity | None = None
    disability_status: DisabilityStatus | None = None
    sexual_orientation: SexualOrientation | None = None

    def answered(self) -> dict[str, str]:
        return {field: value for field, value in self.model_dump(mode="json").items() if value is not None}


class CandidateDemographicsRead(DemographicAnswers):
    """GET/PUT /candidate/demographics: the signed-in candidate's own answers. Candidate-only."""

    updated_at: Timestamp | None = None


class DemographicBucket(APIModel):
    key: str  # an answer's value, or "other_insufficient" for small groups combined
    label: str
    share: int  # whole percent of this question's respondents


class DemographicDimension(APIModel):
    dimension: str  # region, race_ethnicity, disability_status or sexual_orientation
    label: str
    # Respondents rounded down to a multiple of 5, so a single new answer rarely shows.
    respondents_approx: int
    suppressed: bool  # too few answers to report anything
    buckets: list[DemographicBucket] = []


class DemographicsSummary(APIModel):
    """GET /analytics/demographics: aggregates only, for every voluntary answer ever given (never
    narrowed by date, job or anything else, so no filter can isolate one person's answer)."""

    min_group_size: int
    dimensions: list[DemographicDimension]
    note: str
