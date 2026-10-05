"""Voluntary demographic information.

Candidates give it, optionally, on the demo careers application form or in their portal profile, and
only they can read or change their own answers. Recruiters see aggregates only (aggregate()), built
so that no group smaller than MIN_GROUP_SIZE is ever reported on its own:

- a question with fewer than MIN_GROUP_SIZE respondents reports nothing;
- answers given by fewer than MIN_GROUP_SIZE people are combined into "Other / insufficient data";
- if that combined group would itself be smaller than MIN_GROUP_SIZE, the next-smallest groups join
  it until it isn't (or the question reports nothing), so it can't be subtracted back out;
- shares are whole percentages and respondent counts are rounded down to a multiple of 5.

Aggregates are never filtered by date, job or anything else: a filter narrow enough could leave one
person's answer showing. The answers live in their own table, which nothing else reads: no candidate
record, search, sort, filter, ranking, AI context or analysis can see them.
"""

from collections import Counter
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DisabilityStatus, RaceEthnicity, Region, SexualOrientation
from app.models import Candidate, CandidateDemographics
from app.models.base import utcnow
from app.schemas.demographics import (
    DEMOGRAPHICS_NOTE,
    CandidateDemographicsRead,
    DemographicAnswers,
    DemographicBucket,
    DemographicDimension,
    DemographicsSummary,
)

MIN_GROUP_SIZE = 5
OTHER_INSUFFICIENT = "other_insufficient"

LABELS: dict[StrEnum, str] = {
    Region.UNITED_STATES: "United States",
    Region.INDIA: "India",
    Region.UNITED_KINGDOM: "United Kingdom",
    Region.CANADA: "Canada",
    Region.GERMANY: "Germany",
    Region.OTHER: "Other",
    RaceEthnicity.ASIAN: "Asian",
    RaceEthnicity.BLACK: "Black / African descent",
    RaceEthnicity.HISPANIC_LATINO: "Hispanic / Latino",
    RaceEthnicity.MIDDLE_EASTERN_NORTH_AFRICAN: "Middle Eastern / North African",
    RaceEthnicity.WHITE: "White",
    RaceEthnicity.MULTIRACIAL: "Multiracial",
    RaceEthnicity.ANOTHER_IDENTITY: "Another identity",
    DisabilityStatus.YES: "Yes",
    DisabilityStatus.NO: "No",
    SexualOrientation.STRAIGHT: "Straight / heterosexual",
    SexualOrientation.GAY: "Gay",
    SexualOrientation.LESBIAN: "Lesbian",
    SexualOrientation.BISEXUAL: "Bisexual",
    SexualOrientation.ASEXUAL: "Asexual",
    SexualOrientation.QUEER: "Queer",
    SexualOrientation.ANOTHER_IDENTITY: "Another identity",
}
PREFER_NOT_TO_SAY = "prefer_not_to_say"

# (column, label, its enum, the answer that already means "other", if any)
DIMENSIONS: tuple[tuple[str, str, type[StrEnum], str | None], ...] = (
    ("region", "Region", Region, Region.OTHER),
    ("race_ethnicity", "Race / ethnicity", RaceEthnicity, None),
    ("disability_status", "Disability status", DisabilityStatus, None),
    ("sexual_orientation", "Sexual orientation", SexualOrientation, None),
)
FIELDS = tuple(column for column, *_ in DIMENSIONS)


def label_for(value: str) -> str:
    if value == PREFER_NOT_TO_SAY:
        return "Prefer not to say"
    if value == OTHER_INSUFFICIENT:
        return "Other / insufficient data"
    return next((label for member, label in LABELS.items() if member.value == value), value)


# The candidate's own answers


async def get_own(session: AsyncSession, candidate: Candidate) -> CandidateDemographicsRead:
    row = await session.get(CandidateDemographics, candidate.id)
    if row is None:
        return CandidateDemographicsRead()
    return CandidateDemographicsRead(**{field: getattr(row, field) for field in FIELDS}, updated_at=row.updated_at)


async def save_own(
    session: AsyncSession, candidate: Candidate, answers: DemographicAnswers
) -> CandidateDemographicsRead:
    """Replace the candidate's answers: null leaves a question unanswered (or clears it)."""
    values = answers.model_dump(mode="json")
    row = await session.get(CandidateDemographics, candidate.id)
    if row is None:
        if any(values.values()):
            session.add(CandidateDemographics(candidate_id=candidate.id, **values))
    elif any(values.values()):
        for field, value in values.items():
            setattr(row, field, value)
        row.updated_at = utcnow()
    else:
        await session.delete(row)  # nothing answered: keep nothing
    await session.commit()
    return await get_own(session, candidate)


# Aggregates, for recruiters


async def aggregate(session: AsyncSession, *, min_group_size: int = MIN_GROUP_SIZE) -> DemographicsSummary:
    """Every voluntary answer, combined. Nothing here can name, or be traced back to, a person."""
    rows = (await session.execute(select(*(getattr(CandidateDemographics, field) for field in FIELDS)))).all()
    dimensions = []
    for index, (column, label, _enum, residual) in enumerate(DIMENSIONS):
        counts = Counter(row[index] for row in rows if row[index] is not None)
        dimensions.append(summarize(column, label, counts, residual=residual, min_group_size=min_group_size))
    return DemographicsSummary(
        min_group_size=min_group_size,
        dimensions=dimensions,
        note=DEMOGRAPHICS_NOTE.format(k=min_group_size),
    )


def summarize(
    column: str, label: str, counts: Counter[str], *, residual: str | None = None, min_group_size: int = MIN_GROUP_SIZE
) -> DemographicDimension:
    """One question's answers as suppressed, rounded shares. See the module docstring for the rules."""
    total = sum(counts.values())
    rounded = (total // 5) * 5
    if total < min_group_size:
        return DemographicDimension(dimension=column, label=label, respondents_approx=rounded, suppressed=True)

    visible = {key: count for key, count in counts.items() if count >= min_group_size and key != residual}
    combined = total - sum(visible.values())
    small = any(0 < count < min_group_size for key, count in counts.items() if key != residual)
    # A combined group too small to stand alone takes in the smallest visible groups until it isn't.
    while 0 < combined < min_group_size and visible:
        smallest = min(visible, key=lambda key: (visible[key], key))
        combined += visible.pop(smallest)
        small = True
    if 0 < combined < min_group_size:
        return DemographicDimension(dimension=column, label=label, respondents_approx=rounded, suppressed=True)

    buckets = [
        DemographicBucket(key=key, label=label_for(key), share=round(100 * count / total))
        for key, count in sorted(visible.items(), key=lambda item: (-item[1], item[0]))
    ]
    if combined:
        key = OTHER_INSUFFICIENT if small or residual is None else residual
        buckets.append(DemographicBucket(key=key, label=label_for(key), share=round(100 * combined / total)))
    return DemographicDimension(
        dimension=column, label=label, respondents_approx=rounded, suppressed=False, buckets=buckets
    )
