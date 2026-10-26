"""What candidates may learn about an employer, from its companies row (migration 017).

A candidate only ever learns about the company behind one of their own applications: application ->
job -> company. The portal's Company page shows that company's profile (GET /candidate/company), and
the candidate assistant answers company questions from it and from nothing else (the [company]
section of its prompt). The employer owns the text; nothing here is written by a model.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.tenancy import scoped_company
from app.models import Company


@dataclass(frozen=True)
class Item:
    title: str
    description: str


@dataclass(frozen=True)
class Link:
    label: str
    url: str


@dataclass(frozen=True)
class CompanyProfile:
    id: uuid.UUID
    name: str
    logo_url: str | None
    website: str | None
    overview: str
    mission: str
    highlights: tuple[Item, ...]  # title: the figure ("300+"), description: what it counts
    products: tuple[Item, ...]
    values: tuple[Item, ...]
    benefits: tuple[str, ...]
    benefits_scope: str  # who the listed benefits apply to
    benefits_note: str
    locations: tuple[str, ...]
    locations_note: str
    hiring_process: tuple[str, ...]  # the usual stages, in order
    hiring_note: str
    links: tuple[Link, ...]
    source: str

    def facts(self) -> list[str]:
        """The profile as plain statements, for the assistant's [company] section. What the employer
        hasn't shared is left out rather than guessed."""
        benefits_for = f" for {self.benefits_scope}" if self.benefits_scope else ""
        facts = [
            f"Mission: {self.mission}" if self.mission else "",
            *(f"{item.title} {item.description}." for item in self.highlights),
            *(f"Product, {item.title}: {item.description}" for item in self.products),
            *(f"Value, {item.title}: {item.description}" for item in self.values),
            f"Benefits{benefits_for}: {'; '.join(self.benefits)}. {self.benefits_note}" if self.benefits else "",
            f"Offices: {', '.join(self.locations)}. {self.locations_note}" if self.locations else "",
            (
                "Typical interview process: " + ", then ".join(step.lower() for step in self.hiring_process) + "."
                if self.hiring_process
                else ""
            ),
            self.hiring_note,
            *(f"{link.label}: {link.url}" for link in self.links),
        ]
        return [fact.strip() for fact in facts if fact.strip()]


def profile_for(company: Company) -> CompanyProfile:
    return CompanyProfile(
        id=company.id,
        name=company.name,
        logo_url=company.logo_url,
        website=company.website,
        overview=company.overview or "",
        mission=company.mission or "",
        highlights=_items(company.highlights),
        products=_items(company.products),
        values=_items(company.culture),
        benefits=tuple(company.benefits or ()),
        benefits_scope=company.benefits_scope or "",
        benefits_note=company.benefits_note or "",
        locations=tuple(company.locations or ()),
        locations_note=company.locations_note or "",
        hiring_process=tuple(company.hiring_process or ()),
        hiring_note=company.hiring_note or "",
        links=tuple(Link(link["label"], link["url"]) for link in company.links or ()),
        source=company.source or "",
    )


def _items(rows: list[dict[str, Any]] | None) -> tuple[Item, ...]:
    return tuple(Item(row["title"], row["description"]) for row in rows or ())


async def workspace_company_id(session: AsyncSession) -> uuid.UUID:
    """The employer that owns this workspace: jobs created here (by a recruiter, from Ashby, as demo
    jobs) belong to it. In a recruiter's request it's their own company (core/tenancy.py). Outside one
    (the Ashby integration, which is connected for one employer) it's the oldest company; an empty
    database gets one named ORGANIZATION_NAME."""
    scoped = scoped_company(session)
    if scoped is not None:
        return scoped
    company_id = await session.scalar(select(Company.id).order_by(Company.created_at, Company.id).limit(1))
    if company_id is not None:
        return company_id
    company = Company(slug="workspace", name=settings.organization_name, overview=settings.organization_overview)
    session.add(company)
    await session.flush()
    return company.id
