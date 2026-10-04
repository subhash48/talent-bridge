"""What candidates may learn about the company, in one place. The candidate portal's Company page shows
it (GET /candidate/company), and the candidate assistant answers company questions from it and from
nothing else (it is the [company] section of every assistant prompt).

Every statement is one the company makes publicly: taken from encord.com (the home page and
/careers) on 3 October 2026. Candidates read it and the assistant repeats it, so the hiring team owns
it. Edit the text here, keep each claim one Encord makes publicly, and update `source` when you do. The
overview is settings.organization_overview: its text is in backend/app/core/config.py, and
ORGANIZATION_OVERVIEW in backend/.env overrides it.
"""

from dataclasses import dataclass

from app.core.config import settings


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
    name: str
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
        """The profile as plain statements, for the assistant's [company] section."""
        return [
            f"Mission: {self.mission}",
            *(f"{item.title} {item.description}." for item in self.highlights),
            *(f"Product, {item.title}: {item.description}" for item in self.products),
            *(f"Value, {item.title}: {item.description}" for item in self.values),
            f"Benefits for {self.benefits_scope}: {'; '.join(self.benefits)}. {self.benefits_note}",
            f"Offices: {', '.join(self.locations)}. {self.locations_note}",
            "Typical interview process: " + ", then ".join(step.lower() for step in self.hiring_process) + ".",
            self.hiring_note,
            *(f"{link.label}: {link.url}" for link in self.links),
        ]


def company_profile() -> CompanyProfile:
    return CompanyProfile(
        name=settings.organization_name,
        overview=settings.organization_overview,
        mission=(
            "AI alignment starts with Encord: the quality of AI is only as good as the data behind it. Encord builds the "
            "infrastructure to build, curate and validate training data, helping the world's best AI teams move faster, "
            "label smarter and ship models that work in production, from autonomous vehicles to surgical robotics."
        ),
        highlights=(
            Item("300+", "leading AI teams build with Encord, including Woven by Toyota, AXA, UiPath and Zipline"),
            Item(
                "$110M",
                "total funding raised, from investors including Wellington Management, Y Combinator, CRV and N47",
            ),
            Item("45+", "nationalities represented on the team"),
        ),
        products=(
            Item(
                "Label and annotate",
                "Video, LiDAR, audio, text and sensor-fusion annotation in one workflow, with label lineage and quality "
                "controls built in for production scale.",
            ),
            Item(
                "Curate and collect",
                "Collect data from dedicated facilities or a fleet, then use embedding-based search and model-in-the-loop "
                "curation to find rare edge cases and close distribution gaps.",
            ),
            Item(
                "Align and evaluate",
                "RLHF, rubric-based evaluation and pairwise comparison for models in production, to find where AI fails "
                "and route it back into training.",
            ),
            Item(
                "Data-as-a-Service",
                "Expert annotators, domain specialists and managed data collection, including teleoperation facilities "
                "for physical AI, integrated with the platform.",
            ),
        ),
        values=(
            Item(
                "High agency",
                "You see something broken, you fix it or find the person who can. Encord celebrates the people who solve "
                "90% of a problem before anyone asks.",
            ),
            Item(
                "Builds with care and urgency",
                "Encord bear-hugs the customer. Former founders and people from fast-moving, high-stakes environments "
                "thrive here.",
            ),
            Item(
                "Self-aware and hungry",
                "The team stays warm, self-aware and genuinely hungry. People elevate their peers, and ego doesn't last long.",
            ),
            Item(
                "Invents in real time",
                "The team moves toward ambiguity: pragmatic, resourceful and energised by the fact that there's no playbook.",
            ),
        ),
        benefits=(
            "Equity in a hyper-growth startup",
            "25 days paid time off",
            "Private health insurance",
            "Annual learning and development stipend",
            "Monthly team events and bi-annual offsites",
            "Team lunch twice a week",
            "Visa sponsorship, considered case by case for the role, level and location",
            "Payroll giving scheme",
            "Cycle to work scheme",
            "Home and tech scheme",
            "A strong in-person culture",
        ),
        benefits_scope="UK employees",
        benefits_note=(
            "These are the benefits Encord lists for UK employees. Benefits in the US differ; your recruiter can walk "
            "you through the package for your location."
        ),
        locations=("London", "San Francisco", "New York"),
        locations_note=(
            "Encord describes a strong in-person culture. Each job posting lists its own location and work arrangement."
        ),
        hiring_process=(
            "Recruiter screen",
            "Hiring manager conversation",
            "Skills-based interview or take-home",
            "Final panel",
        ),
        hiring_note=(
            "The process varies by role and team, and is usually four or five stages in total. Your recruiter walks you "
            "through the specific steps at the start, so there are no surprises."
        ),
        links=(
            Link("Encord website", "https://encord.com/"),
            Link("Explore the product", "https://encord.com/explore-product/"),
            Link("Careers and open roles", "https://encord.com/careers/"),
            Link("Encord blog", "https://encord.com/blog/"),
            Link("Trust center", "https://trust.encord.com/"),
        ),
        source="From encord.com, October 2026.",
    )
