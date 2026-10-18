"""Voluntary demographic information given before TalentBridge stopped collecting it: the aggregates
recruiters see. They carry no candidate id, name or email.
"""

from app.schemas.common import APIModel

DEMOGRAPHICS_NOTE = (
    "Voluntary and optional. Reported only in aggregate, with groups smaller than {k} combined or hidden, to "
    "understand and improve the candidate experience. Individual answers are never shown and never used in "
    "hiring decisions."
)


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
