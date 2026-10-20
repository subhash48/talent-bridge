"""The seeded employers' approved profiles, as the API builds them, for comparing answers against."""

from datetime import UTC, datetime

from app.db.seed import build_seed
from app.models import Company
from app.services.ai.portal_context import PortalContext
from app.services.company_profile import CompanyProfile, profile_for


def seeded_profile(slug: str) -> CompanyProfile:
    row = next(row for row in build_seed()[Company] if row["slug"] == slug)
    return profile_for(Company(**{key: value for key, value in row.items() if key not in ("created_at", "updated_at")}))


def portal_context(profile: CompanyProfile, **changes: object) -> PortalContext:
    """A minimal assistant context for one application at the given employer."""
    values: dict[str, object] = {
        "first_name": "Sophia", "location": None, "headline": None, "skills": (), "profile": profile,
        "job_title": "Product Designer", "job_department": None, "job_location": None, "employment_type": "Full-time",
        "hiring_manager": None, "job_summary": None, "job_requirements": (), "stage_label": "Interview",
        "status": "active", "next_step": "Prepare.", "interviews": (), "activity": (), "messages": (),
        "recruiter_name": None, "now": datetime.now(UTC),
    }  # fmt: skip
    return PortalContext(**{**values, **changes})  # type: ignore[arg-type]
