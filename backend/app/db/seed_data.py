"""The demo pipeline: the candidates, jobs, interviews and threads the recruiter dashboard shows.

Times are relative ("minutes ago", "days from today at HH:MM UTC"), so the demo always looks
current. Ported from the frontend's original mock data (frontend/services/mock/data.ts).
"""

from dataclasses import dataclass

from app.core.enums import ActivityType as A
from app.core.enums import (
    ApplicationStage,
    InterviewStatus,
    InterviewType,
    JobStatus,
    SenderType,
)

DAY = 24 * 60

RECRUITER = {"email": "alex.chen@encord.example", "full_name": "Alex Chen"}
# Nova AI's recruiter, so a Nova AI application is never answered in an Encord recruiter's name.
NOVA_RECRUITER = {"email": "mira.hoffmann@nova-ai.example", "full_name": "Mira Hoffmann"}


@dataclass(frozen=True)
class CompanySeed:
    """An employer and the profile it approved for candidates (models/company.py). The oldest one is
    the workspace's own company: jobs created in the workspace belong to it."""

    key: str  # the slug
    name: str
    created_days_ago: int
    logo_url: str | None
    website: str | None
    overview: str
    mission: str
    highlights: tuple[tuple[str, str], ...]  # (figure, what it counts)
    products: tuple[tuple[str, str], ...]  # (name, description)
    values: tuple[tuple[str, str], ...]  # (name, description)
    benefits: tuple[str, ...]
    benefits_scope: str
    benefits_note: str
    locations: tuple[str, ...]
    locations_note: str
    hiring_process: tuple[str, ...]
    hiring_note: str
    links: tuple[tuple[str, str], ...]  # (label, url)
    source: str


COMPANIES: tuple[CompanySeed, ...] = (
    # Every statement is one Encord makes publicly, taken from encord.com (the home page and /careers)
    # on 3 October 2026. Re-check it against encord.com before relying on it.
    CompanySeed(
        "encord",
        "Encord",
        400,
        "/logos/encord.svg",
        "https://encord.com/",
        overview=(
            "Encord builds the data development platform AI teams use to curate, annotate and evaluate "
            "multimodal training data, from images and video to documents and 3D sensor data."
        ),
        mission=(
            "AI alignment starts with Encord: the quality of AI is only as good as the data behind it. Encord builds the "
            "infrastructure to build, curate and validate training data, helping the world's best AI teams move faster, "
            "label smarter and ship models that work in production, from autonomous vehicles to surgical robotics."
        ),
        highlights=(
            ("300+", "leading AI teams build with Encord, including Woven by Toyota, AXA, UiPath and Zipline"),
            (
                "$110M",
                "total funding raised, from investors including Wellington Management, Y Combinator, CRV and N47",
            ),
            ("45+", "nationalities represented on the team"),
        ),
        products=(
            (
                "Label and annotate",
                (
                    "Video, LiDAR, audio, text and sensor-fusion annotation in one workflow, with label lineage and quality "
                    "controls built in for production scale."
                ),
            ),
            (
                "Curate and collect",
                (
                    "Collect data from dedicated facilities or a fleet, then use embedding-based search and model-in-the-loop "
                    "curation to find rare edge cases and close distribution gaps."
                ),
            ),
            (
                "Align and evaluate",
                (
                    "RLHF, rubric-based evaluation and pairwise comparison for models in production, to find where AI fails "
                    "and route it back into training."
                ),
            ),
            (
                "Data-as-a-Service",
                (
                    "Expert annotators, domain specialists and managed data collection, including teleoperation facilities "
                    "for physical AI, integrated with the platform."
                ),
            ),
        ),
        values=(
            (
                "High agency",
                (
                    "You see something broken, you fix it or find the person who can. Encord celebrates the people who solve "
                    "90% of a problem before anyone asks."
                ),
            ),
            (
                "Builds with care and urgency",
                (
                    "Encord bear-hugs the customer. Former founders and people from fast-moving, high-stakes environments "
                    "thrive here."
                ),
            ),
            (
                "Self-aware and hungry",
                "The team stays warm, self-aware and genuinely hungry. People elevate their peers, and ego doesn't last long.",
            ),
            (
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
            ("Encord website", "https://encord.com/"),
            ("Explore the product", "https://encord.com/explore-product/"),
            ("Careers and open roles", "https://encord.com/careers/"),
            ("Encord blog", "https://encord.com/blog/"),
            ("Trust center", "https://trust.encord.com/"),
        ),
        source="From encord.com, October 2026.",
    ),
    # Fictional: a second employer, so the portal can be seen (and tested) with applications at two
    # companies. Its links use the reserved .example domain.
    CompanySeed(
        "nova-ai",
        "Nova AI",
        200,
        "/logos/nova-ai.svg",
        "https://nova-ai.example/",
        overview=(
            "Nova AI builds speech and language models that let customer support teams answer people in more than 40 "
            "languages, in real time."
        ),
        mission="Make every conversation understood: an answer in your own language, without the wait.",
        highlights=(
            ("40+", "languages supported in production"),
            ("120", "people across Berlin and Lisbon"),
            ("$62M", "raised to date, most recently a Series B led by Northlight Ventures"),
        ),
        products=(
            ("Nova Voice", "Real-time speech recognition and synthesis, tuned for contact centres and noisy lines."),
            (
                "Nova Translate",
                "Streaming translation between 40+ languages, with glossaries for each customer's domain.",
            ),
            (
                "Nova Evaluate",
                "An evaluation suite that checks model answers for accuracy, tone and policy compliance.",
            ),
        ),
        values=(
            (
                "Customers first",
                "Every team spends time on real support calls, so decisions start from what customers hear.",
            ),
            ("Ship small, ship often", "Small releases, measured carefully, beat big launches."),
            ("Say it plainly", "Clear writing and direct feedback, given kindly."),
            ("Grow together", "Senior people mentor, and everyone gets time to learn."),
        ),
        benefits=(
            "30 days paid holiday",
            "Hybrid working, two office days a week",
            "€2,000 annual learning budget",
            "Mental health support through a wellbeing platform",
            "Relocation support to Berlin or Lisbon",
            "Company-paid public transport ticket",
        ),
        benefits_scope="all employees",
        benefits_note="Benefits are the same in Berlin and Lisbon. Your recruiter can share the details for your contract.",
        locations=("Berlin", "Lisbon"),
        locations_note="Most teams work hybrid, with two days a week in the office.",
        hiring_process=("Recruiter screen", "Technical interview", "Team conversation", "Founder chat"),
        hiring_note="Most processes take three to four weeks, and your recruiter shares feedback after every stage.",
        links=(
            ("Nova AI website", "https://nova-ai.example/"),
            ("Engineering blog", "https://nova-ai.example/blog/"),
        ),
        source="Fictional demo employer in TalentBridge's seed data.",
    ),
)


@dataclass(frozen=True)
class JobSeed:
    title: str
    department: str
    location: str
    hiring_manager: str
    opened_days_ago: int
    summary: str
    requirements: tuple[str, ...]
    status: JobStatus = JobStatus.OPEN
    company: str = "encord"  # a CompanySeed key

    @property
    def description(self) -> str:
        return f"{self.summary}\n\nRequirements: {', '.join(self.requirements)}."


@dataclass(frozen=True)
class Event:
    type: A
    title: str
    minutes_ago: int


@dataclass(frozen=True)
class CandidateSeed:
    key: str
    first_name: str
    last_name: str
    job: str
    location: str
    stage: ApplicationStage
    added_minutes_ago: int
    skills: tuple[str, ...]
    events: tuple[Event, ...] = ()
    created_title: str = "Added to pipeline"
    source: str = "LinkedIn"
    pronouns: str | None = None
    headline: str | None = None
    phone: str | None = None
    # Minutes ago for each stage move after sourced; spread evenly when not given.
    moves: tuple[int, ...] | None = None


@dataclass(frozen=True)
class ApplicationSeed:
    """A further application by a candidate from CANDIDATES, to another job. Its key stands in for the
    candidate's in INTERVIEWS and THREADS."""

    key: str
    candidate: str  # a CandidateSeed key
    job: str
    stage: ApplicationStage
    added_minutes_ago: int
    events: tuple[Event, ...] = ()
    created_title: str = "Applied"
    source: str = "Careers site"
    moves: tuple[int, ...] | None = None
    recruiter: str = RECRUITER["email"]  # who moved it through the pipeline


@dataclass(frozen=True)
class InterviewSeed:
    candidate: str
    title: str
    days: int  # calendar days from today; negative for past interviews
    at: str  # HH:MM UTC
    duration_minutes: int
    interview_type: InterviewType
    interviewers: tuple[str, ...]
    status: InterviewStatus = InterviewStatus.SCHEDULED
    confirmed: bool = False
    notes: str | None = None


@dataclass(frozen=True)
class MessageSeed:
    sender: SenderType
    minutes_ago: int
    content: str


@dataclass(frozen=True)
class ThreadSeed:
    candidate: str
    messages: tuple[MessageSeed, ...]
    unread: int = 0  # the last N candidate messages are unread


JOBS: tuple[JobSeed, ...] = (
    JobSeed(
        "Product Designer",
        "Design",
        "London, UK · Hybrid",
        "Maya Okafor",
        21,
        "Design the workflows teams use to curate, annotate and evaluate multimodal training data.",
        ("Figma", "Design systems", "Prototyping", "User research", "Interaction design"),
    ),
    JobSeed(
        "ML Engineer",
        "Machine Learning",
        "London, UK · Hybrid",
        "Tom Reid",
        28,
        "Build the model-assisted labeling and active learning systems behind Encord's data engine.",
        ("PyTorch", "Computer vision", "Distributed training", "MLOps", "Active learning"),
    ),
    JobSeed(
        "Product Manager",
        "Product",
        "San Francisco, CA",
        "Hannah Lee",
        35,
        "Own the roadmap for data curation and evaluation across computer vision and physical AI.",
        ("Roadmapping", "B2B SaaS", "ML products", "Analytics", "Discovery"),
    ),
    JobSeed(
        "Software Engineer",
        "Engineering",
        "London, UK",
        "Ian Park",
        40,
        "Scale the platform that stores, indexes and serves petabytes of sensor, video and text data.",
        ("Python", "Go", "Postgres", "Distributed systems", "Kubernetes"),
    ),
    JobSeed(
        "Data Scientist",
        "Machine Learning",
        "London, UK",
        "Ana Silva",
        45,
        "Measure data quality and model performance, and turn the findings into product features.",
        ("Python", "SQL", "Experimentation", "Causal inference", "Statistics"),
    ),
    JobSeed(
        "DevOps Engineer",
        "Platform",
        "London, UK · Remote-friendly",
        "Ian Park",
        24,
        "Run the GPU-heavy infrastructure that keeps customer pipelines fast and reliable.",
        ("Kubernetes", "Terraform", "AWS", "Observability", "CI/CD"),
    ),
    JobSeed(
        "Frontend Engineer",
        "Engineering",
        "San Francisco, CA",
        "Ian Park",
        18,
        "Build high-performance annotation editors for video, 3D point clouds and documents.",
        ("React", "TypeScript", "Performance", "Accessibility", "WebGL"),
    ),
    JobSeed(
        "Solutions Engineer",
        "Customer",
        "New York, NY",
        "Kai Tanaka",
        50,
        "Partner with AI teams to design data pipelines and get them to production on Encord.",
        ("Python", "APIs", "Solutions architecture", "Pre-sales", "Computer vision"),
        status=JobStatus.CLOSED,
    ),
    JobSeed(
        "Computer Vision Researcher",
        "Research",
        "London, UK",
        "Ana Silva",
        3,
        "Research label-efficient learning methods and bring them into the product.",
        ("PyTorch", "Segmentation", "Research", "Active learning", "Vision transformers"),
        status=JobStatus.DRAFT,
    ),
    JobSeed(
        "Applied AI Engineer",
        "Applied AI",
        "Berlin, Germany · Hybrid",
        "Lena Vogel",
        30,
        "Turn Nova AI's speech and translation research into features customers use on live support calls.",
        ("Python", "LLM evaluation", "Speech recognition", "PyTorch", "APIs"),
        company="nova-ai",
    ),
)

S = ApplicationStage

CANDIDATES: tuple[CandidateSeed, ...] = (
    CandidateSeed(
        "sophia-martinez",
        "Sophia",
        "Martinez",
        "Product Designer",
        "London, UK",
        S.INTERVIEW,
        12 * DAY,
        ("Figma", "Design systems", "Prototyping", "User research"),
        events=(
            Event(A.INTERVIEW_CONFIRMED, "Confirmed interview", 120),
            Event(A.PREP_VIEWED, "Viewed prep materials", 1440),
            Event(A.QUESTION_ASKED, "Asked about the product team", 1500),
            Event(A.INTERVIEW_SCHEDULED, "Design interview scheduled", 2940),
            Event(A.INTERVIEW_COMPLETED, "Portfolio review completed", 5800),
            Event(A.MESSAGE_RECEIVED, "Replied to message", 7100),
        ),
        source="Referral",
        pronouns="she/her",
        phone="+44 20 7946 0123",
        headline="Product designer focused on design systems for data-heavy B2B tools",
        moves=(14000, 6000),
    ),
    CandidateSeed(
        "james-park",
        "James",
        "Park",
        "ML Engineer",
        "San Francisco, CA",
        S.SCREENING,
        9 * DAY,
        ("PyTorch", "Computer vision", "Distributed training", "MLOps"),
        events=(
            Event(A.MESSAGE_RECEIVED, "Replied to message", 300),
            Event(A.ASSESSMENT_COMPLETED, "Submitted take-home", 2600),
        ),
        phone="+1 415 555 0142",
        headline="ML engineer training large computer vision models",
        moves=(9000,),
    ),
    CandidateSeed(
        "priya-desai",
        "Priya",
        "Desai",
        "Product Manager",
        "New York, NY",
        S.INTERVIEW,
        15 * DAY,
        ("Roadmapping", "B2B SaaS", "ML products", "Analytics"),
        events=(
            Event(A.PREP_VIEWED, "Viewed prep materials", 1440),
            Event(A.INTERVIEW_SCHEDULED, "Product sense interview scheduled", 2950),
            Event(A.MESSAGE_RECEIVED, "Replied to message", 4400),
        ),
        source="Careers page",
        phone="+1 212 555 0187",
        headline="Product manager for B2B machine learning platforms",
        moves=(18000, 8000),
    ),
    CandidateSeed(
        "daniel-lee",
        "Daniel",
        "Lee",
        "Software Engineer",
        "London, UK",
        S.SOURCED,
        1500,
        ("TypeScript", "Go", "Postgres", "Kubernetes"),
        headline="Backend engineer building Go services on Kubernetes",
    ),
    CandidateSeed(
        "olivia-chen",
        "Olivia",
        "Chen",
        "Data Scientist",
        "London, UK",
        S.OFFER,
        30 * DAY,
        ("Python", "Causal inference", "Experimentation", "SQL"),
        events=(
            Event(A.OFFER_SENT, "Offer sent", 2880),
            Event(A.QUESTION_ASKED, "Asked about start dates", 3100),
            Event(A.DOCUMENT_SHARED, "Shared references", 3400),
            Event(A.INTERVIEW_COMPLETED, "Final interview completed", 7300),
        ),
        source="Referral",
        phone="+44 20 7946 0456",
        headline="Data scientist specialising in causal inference and experimentation",
        moves=(38000, 25000, 3000),
    ),
    CandidateSeed(
        "ethan-walker",
        "Ethan",
        "Walker",
        "DevOps Engineer",
        "Berlin, Germany",
        S.SCREENING,
        8 * DAY,
        ("Terraform", "AWS", "Kubernetes", "Observability"),
        events=(
            Event(A.ASSESSMENT_COMPLETED, "Completed assessment", 3000),
            Event(A.ASSESSMENT_SENT, "Assessment sent", 4000),
        ),
        pronouns="he/him",
        headline="Platform engineer running Kubernetes on AWS",
        moves=(9500,),
    ),
    CandidateSeed(
        "isabella-rossi",
        "Isabella",
        "Rossi",
        "Product Designer",
        "Milan, Italy",
        S.INTERVIEW,
        14 * DAY,
        ("Interaction design", "Figma", "Motion design", "Accessibility"),
        events=(
            Event(A.QUESTION_ASKED, "Asked about the portfolio review panel", 4320),
            Event(A.INTERVIEW_SCHEDULED, "Portfolio review scheduled", 5800),
        ),
        source="Careers page",
        headline="Interaction designer with a focus on motion and accessibility",
        moves=(16000, 7000),
    ),
    CandidateSeed(
        "marcus-johnson",
        "Marcus",
        "Johnson",
        "Software Engineer",
        "London, UK",
        S.SCREENING,
        10 * DAY,
        ("Rust", "Python", "Distributed systems", "gRPC"),
        events=(Event(A.DOCUMENT_SHARED, "Shared GitHub profile", 4500),),
    ),
    CandidateSeed(
        "diego-fernandez",
        "Diego",
        "Fernández",
        "DevOps Engineer",
        "Madrid, Spain",
        S.INTERVIEW,
        22 * DAY,
        ("Kubernetes", "Helm", "Prometheus", "SRE"),
        events=(Event(A.INTERVIEW_COMPLETED, "Completed infrastructure interview", 4700),),
    ),
    CandidateSeed(
        "aisha-khan",
        "Aisha",
        "Khan",
        "ML Engineer",
        "London, UK",
        S.INTERVIEW,
        18 * DAY,
        ("Multimodal models", "PyTorch", "Data curation", "CUDA"),
        events=(Event(A.INTERVIEW_CONFIRMED, "Confirmed interview", 5100),),
        pronouns="she/her",
    ),
    CandidateSeed(
        "lucas-moreau",
        "Lucas",
        "Moreau",
        "Frontend Engineer",
        "Paris, France",
        S.SOURCED,
        6 * DAY,
        ("React", "TypeScript", "WebGL", "Design systems"),
        events=(Event(A.MESSAGE_SENT, "Outreach sent", 5800),),
    ),
    CandidateSeed(
        "hana-sato",
        "Hana",
        "Sato",
        "Data Scientist",
        "Amsterdam, Netherlands",
        S.SCREENING,
        12 * DAY,
        ("Statistics", "Python", "Active learning", "Data labeling"),
        events=(
            Event(A.ASSESSMENT_SENT, "Assessment sent", 6000),
            Event(A.MESSAGE_RECEIVED, "Replied to message", 11000),
        ),
    ),
    CandidateSeed(
        "noah-williams",
        "Noah",
        "Williams",
        "DevOps Engineer",
        "Manchester, UK",
        S.SOURCED,
        7 * DAY,
        ("GCP", "Terraform", "CI/CD", "Linux"),
        events=(Event(A.RESUME_VIEWED, "Profile reviewed", 6500),),
    ),
    CandidateSeed(
        "elena-petrova",
        "Elena",
        "Petrova",
        "Product Manager",
        "London, UK",
        S.OFFER,
        34 * DAY,
        ("Platform strategy", "Pricing", "Developer tools", "Discovery"),
        events=(
            Event(A.OFFER_VIEWED, "Viewed offer", 6800),
            Event(A.OFFER_SENT, "Offer sent", 8000),
        ),
    ),
    CandidateSeed(
        "mateo-garcia",
        "Mateo",
        "García",
        "Software Engineer",
        "Madrid, Spain",
        S.HIRED,
        45 * DAY,
        ("Go", "Kubernetes", "Postgres", "Event sourcing"),
        events=(Event(A.OFFER_ACCEPTED, "Signed offer", 7400),),
    ),
    CandidateSeed(
        "grace-kim",
        "Grace",
        "Kim",
        "Product Designer",
        "Toronto, Canada",
        S.SOURCED,
        7900,
        ("Product design", "User research", "Figma", "Data visualization"),
        created_title="Sourced from LinkedIn",
    ),
    CandidateSeed(
        "omar-haddad",
        "Omar",
        "Haddad",
        "ML Engineer",
        "London, UK",
        S.INTERVIEW,
        20 * DAY,
        ("Vision transformers", "Segmentation", "PyTorch", "Research"),
        events=(Event(A.INTERVIEW_RESCHEDULE_REQUESTED, "Requested reschedule", 8300),),
    ),
    CandidateSeed(
        "chloe-dubois",
        "Chloé",
        "Dubois",
        "Frontend Engineer",
        "Paris, France",
        S.SCREENING,
        11 * DAY,
        ("React", "Next.js", "Accessibility", "Testing"),
        events=(Event(A.ASSESSMENT_COMPLETED, "Submitted take-home", 8600),),
    ),
    CandidateSeed(
        "fatima-al-sayed",
        "Fatima",
        "Al-Sayed",
        "Solutions Engineer",
        "Dubai, UAE",
        S.SCREENING,
        13 * DAY,
        ("Solutions architecture", "Python", "Pre-sales", "Cloud"),
        events=(Event(A.ASSESSMENT_SENT, "Assessment sent", 8900),),
    ),
    CandidateSeed(
        "ravi-patel",
        "Ravi",
        "Patel",
        "Data Scientist",
        "London, UK",
        S.HIRED,
        60 * DAY,
        ("Python", "Forecasting", "MLOps", "SQL"),
        events=(Event(A.ONBOARDING_STARTED, "Started onboarding", 9200),),
    ),
    CandidateSeed(
        "zoe-anderson",
        "Zoe",
        "Anderson",
        "Solutions Engineer",
        "New York, NY",
        S.SOURCED,
        9800,
        ("Python", "APIs", "Customer success", "Computer vision"),
        created_title="Referred by Kai Tanaka",
        source="Referral",
    ),
    CandidateSeed(
        "samuel-okoro",
        "Samuel",
        "Okoro",
        "Software Engineer",
        "London, UK",
        S.INTERVIEW,
        16 * DAY,
        ("Java", "Kotlin", "Distributed systems", "AWS"),
        events=(Event(A.INTERVIEW_SCHEDULED, "Technical interview scheduled", 10200),),
    ),
    CandidateSeed(
        "mia-novak",
        "Mia",
        "Novak",
        "Product Designer",
        "Berlin, Germany",
        S.HIRED,
        52 * DAY,
        ("Design systems", "Figma", "Prototyping", "Branding"),
        events=(Event(A.OFFER_ACCEPTED, "Accepted offer", 10800),),
    ),
    CandidateSeed(
        "kenji-watanabe",
        "Kenji",
        "Watanabe",
        "ML Engineer",
        "Tokyo, Japan",
        S.SCREENING,
        9 * DAY,
        ("3D vision", "LiDAR", "PyTorch", "C++"),
        events=(Event(A.MESSAGE_RECEIVED, "Replied to message", 11500),),
    ),
    CandidateSeed(
        "leah-cohen",
        "Leah",
        "Cohen",
        "Product Manager",
        "London, UK",
        S.SOURCED,
        9 * DAY,
        ("Data platforms", "AI products", "Analytics", "Strategy"),
        events=(Event(A.MESSAGE_SENT, "Outreach sent", 12000),),
    ),
    CandidateSeed(
        "amara-nwosu",
        "Amara",
        "Nwosu",
        "Data Scientist",
        "London, UK",
        S.OFFER,
        38 * DAY,
        ("NLP", "Python", "Evaluation", "LLMs"),
        events=(Event(A.QUESTION_ASKED, "Asked about equity", 13200),),
    ),
    CandidateSeed(
        "jonas-becker",
        "Jonas",
        "Becker",
        "Software Engineer",
        "Berlin, Germany",
        S.HIRED,
        70 * DAY,
        ("Rust", "Systems", "Performance", "Linux"),
        events=(Event(A.ONBOARDING_STARTED, "Started onboarding", 14000),),
    ),
    CandidateSeed(
        "ben-carter",
        "Ben",
        "Carter",
        "Frontend Engineer",
        "Bristol, UK",
        S.INTERVIEW,
        19 * DAY,
        ("React", "TypeScript", "Canvas", "Performance"),
        events=(Event(A.INTERVIEW_CONFIRMED, "Confirmed interview", 15000),),
    ),
    CandidateSeed(
        "yuki-tanaka",
        "Yuki",
        "Tanaka",
        "ML Engineer",
        "Zurich, Switzerland",
        S.SOURCED,
        16000,
        ("Robotics", "Reinforcement learning", "Simulation", "Python"),
        pronouns="they/them",
    ),
    CandidateSeed(
        "sara-lindqvist",
        "Sara",
        "Lindqvist",
        "Product Designer",
        "Stockholm, Sweden",
        S.HIRED,
        58 * DAY,
        ("Product design", "Research", "Figma", "Workshops"),
        events=(Event(A.OFFER_ACCEPTED, "Signed offer", 17500),),
    ),
    CandidateSeed(
        "arjun-mehta",
        "Arjun",
        "Mehta",
        "Software Engineer",
        "London, UK",
        S.SOURCED,
        19000,
        ("Python", "Data pipelines", "Spark", "Airflow"),
        created_title="Sourced from GitHub",
        source="GitHub",
    ),
    CandidateSeed(
        "nina-kowalski",
        "Nina",
        "Kowalski",
        "Data Scientist",
        "Warsaw, Poland",
        S.HIRED,
        80 * DAY,
        ("Bayesian modeling", "Python", "Experimentation", "R"),
        events=(Event(A.OFFER_ACCEPTED, "Accepted offer", 21000),),
    ),
    # Rosa applied to two employers: this Encord role, and Nova AI's (APPLICATIONS). Her portal opens on
    # this one, the more recently updated.
    CandidateSeed(
        "rosa-navarro",
        "Rosa",
        "Navarro",
        "Software Engineer",
        "Madrid, Spain",
        S.INTERVIEW,
        14 * DAY,
        ("Python", "Go", "Distributed systems", "Kubernetes", "PyTorch"),
        events=(
            Event(A.INTERVIEW_COMPLETED, "Recruiter screen completed", 9000),
            Event(A.INTERVIEW_SCHEDULED, "Systems design interview scheduled", 2000),
        ),
        created_title="Applied on the careers site",
        source="Careers site",
        headline="Backend engineer moving into applied machine learning",
        moves=(16000, 8800),
    ),
)

ROSA_NOVA = "rosa-navarro@nova-ai"
APPLICATIONS: tuple[ApplicationSeed, ...] = (
    ApplicationSeed(
        ROSA_NOVA,
        "rosa-navarro",
        "Applied AI Engineer",
        S.INTERVIEW,
        16 * DAY,
        events=(
            Event(A.INTERVIEW_COMPLETED, "Recruiter screen completed", 12900),
            Event(A.INTERVIEW_SCHEDULED, "Technical interview scheduled", 4300),
        ),
        created_title="Applied on the Nova AI careers site",
        moves=(15000, 8800),
        recruiter=NOVA_RECRUITER["email"],
    ),
)

V, P, O = InterviewType.VIDEO, InterviewType.PHONE, InterviewType.ONSITE
DONE = InterviewStatus.COMPLETED

INTERVIEWS: tuple[InterviewSeed, ...] = (
    InterviewSeed(
        "sophia-martinez", "Design interview", 1, "10:00", 60, V, ("Maya Okafor", "Leo Brandt"), confirmed=True
    ),
    InterviewSeed("priya-desai", "Product sense interview", 1, "14:30", 45, V, ("Hannah Lee",)),
    InterviewSeed(
        "elena-petrova", "Offer walkthrough call", 1, "17:30", 30, P, ("Hannah Lee", "Alex Chen"), confirmed=True
    ),
    InterviewSeed("aisha-khan", "ML system design", 2, "11:00", 60, O, ("Tom Reid", "Ana Silva"), confirmed=True),
    InterviewSeed("isabella-rossi", "Portfolio review", 2, "15:00", 60, V, ("Maya Okafor",)),
    InterviewSeed("ethan-walker", "Screening call", 2, "16:30", 30, P, ("Alex Chen",), confirmed=True),
    InterviewSeed("samuel-okoro", "Technical interview", 3, "09:30", 90, V, ("Ian Park",), confirmed=True),
    InterviewSeed("james-park", "Technical screen", 3, "16:00", 45, V, ("Tom Reid",)),
    InterviewSeed("omar-haddad", "Research deep dive", 4, "13:00", 60, V, ("Ana Silva",)),
    InterviewSeed(
        "ben-carter", "Frontend pairing session", 5, "10:00", 90, V, ("Ian Park", "Leo Brandt"), confirmed=True
    ),
    InterviewSeed("diego-fernandez", "Infrastructure interview", -3, "15:00", 60, V, ("Ian Park",), DONE, True),
    InterviewSeed(
        "sophia-martinez",
        "Portfolio review",
        -4,
        "11:00",
        45,
        V,
        ("Maya Okafor",),
        DONE,
        True,
        "Strong design systems thinking and clear rationale for component decisions. Prototyping was fast "
        "and polished. Recommend the design interview.",
    ),
    InterviewSeed(
        "olivia-chen",
        "Final interview",
        -5,
        "14:00",
        60,
        O,
        ("Ana Silva", "Tom Reid"),
        DONE,
        True,
        "Excellent depth on experimentation and causal inference, and explained trade-offs clearly to a "
        "non-technical panel.",
    ),
    InterviewSeed(
        "priya-desai",
        "Recruiter screen",
        -10,
        "10:00",
        30,
        P,
        ("Alex Chen",),
        DONE,
        True,
        "Clear product thinking on ML tooling and a strong B2B SaaS background. Motivated by the data-curation problem space.",
    ),
    InterviewSeed("rosa-navarro", "Systems design interview", 2, "15:00", 60, V, ("Ian Park",)),
    InterviewSeed(
        "rosa-navarro",
        "Recruiter screen",
        -6,
        "11:00",
        30,
        P,
        ("Alex Chen",),
        DONE,
        True,
        "Strong distributed systems background; check depth on Kubernetes operations.",
    ),
    InterviewSeed(ROSA_NOVA, "Technical interview", 4, "13:00", 60, V, ("Lena Vogel", "Tariq Aziz")),
    InterviewSeed(
        ROSA_NOVA,
        "Recruiter screen",
        -9,
        "09:30",
        30,
        P,
        (NOVA_RECRUITER["full_name"],),
        DONE,
        True,
        "Strong on LLM evaluation; probe system design depth in the technical round.",
    ),
)

C, R = SenderType.CANDIDATE, SenderType.RECRUITER

THREADS: tuple[ThreadSeed, ...] = (
    ThreadSeed(
        "sophia-martinez",
        (
            MessageSeed(
                R,
                7300,
                "Hi Sophia, thanks again for the portfolio review. The team loved your design systems work. We'd like to invite you to a design interview with Maya and Leo. I'll send a few time options shortly.",
            ),
            MessageSeed(C, 7100, "That's great news, thank you! Any of those slots should work for me."),
            MessageSeed(
                R,
                2900,
                "Your design interview is booked. I've also added prep materials to your candidate portal, including an outline of the design exercise.",
            ),
            MessageSeed(
                C,
                120,
                "Thanks Alex! Just confirmed for tomorrow at 10. Is there anything specific I should prepare for the design exercise?",
            ),
        ),
        unread=1,
    ),
    ThreadSeed(
        "james-park",
        (
            MessageSeed(
                R,
                2000,
                "Hi James, thanks for sending over your take-home. Tom would love to do a technical screen. Would early next week work?",
            ),
            MessageSeed(
                C, 300, "Hi Alex, yes that works. Any afternoon is good for me. Looking forward to meeting Tom."
            ),
        ),
        unread=1,
    ),
    ThreadSeed(
        "isabella-rossi",
        (
            MessageSeed(
                R,
                5800,
                "Hi Isabella, your portfolio review with Maya is in the calendar. Let me know if you have any questions before then.",
            ),
            MessageSeed(
                C, 4320, "Quick question: will the portfolio review be with the whole design team, or just Maya?"
            ),
        ),
        unread=1,
    ),
    ThreadSeed(
        "priya-desai",
        (
            MessageSeed(C, 4400, "Thanks for the update! Excited for the next round."),
            MessageSeed(
                R,
                2950,
                "Hi Priya, your product sense interview with Hannah is scheduled. Prep materials are waiting in your candidate portal.",
            ),
        ),
    ),
    ThreadSeed(
        "olivia-chen",
        (
            MessageSeed(
                R,
                2880,
                "Hi Olivia, congratulations! Your offer is attached. Happy to walk through it together whenever suits you.",
            ),
        ),
    ),
    ThreadSeed(
        "ethan-walker",
        (
            MessageSeed(
                R,
                4000,
                "Hi Ethan, here's the link to the infrastructure assessment. Take your time; most people spend about two hours on it.",
            ),
            MessageSeed(C, 3000, "Just submitted the assessment. That was a fun one!"),
        ),
    ),
    ThreadSeed(
        "hana-sato",
        (
            MessageSeed(
                R,
                6000,
                "Hi Hana, just checking you received the data science assessment. Let me know if you need more time.",
            ),
        ),
    ),
    ThreadSeed(
        "elena-petrova",
        (
            MessageSeed(
                C,
                6900,
                "Thanks Alex, I've had a look at the offer. Could we set up a call to go through the equity details?",
            ),
            MessageSeed(
                R, 6850, "Of course. I'll book a call with Hannah and me so we can go through everything together."
            ),
        ),
    ),
    ThreadSeed(
        "leah-cohen",
        (
            MessageSeed(
                R,
                12000,
                "Hi Leah, I lead recruiting for Encord's product team. Your work on data platforms caught my eye. Would you be open to a quick chat about our Product Manager role?",
            ),
        ),
    ),
    ThreadSeed(
        "rosa-navarro",
        (
            MessageSeed(
                R,
                8800,
                "Hi Rosa, thanks for the recruiter screen. Ian would like to meet you for a systems design interview for the Software Engineer role.",
            ),
            MessageSeed(C, 8600, "Thanks Alex, happy to. Any day next week works for me."),
            MessageSeed(
                R,
                2000,
                "Your systems design interview with Ian is booked: 60 minutes on video, about scaling a data pipeline.",
            ),
        ),
    ),
    ThreadSeed(
        ROSA_NOVA,
        (
            MessageSeed(
                R,
                8800,
                "Hi Rosa, thanks for the recruiter screen. We'd love to move you forward to a technical interview for the Applied AI Engineer role with Lena and Tariq.",
            ),
            MessageSeed(C, 8600, "Thank you Mira, that sounds great. I'm looking forward to it."),
            MessageSeed(
                R,
                4300,
                "Your technical interview is booked: 60 minutes on video, covering an LLM evaluation problem and a short system design discussion.",
            ),
        ),
    ),
)

# Status updates from the recruiter. A candidate without a written thread gets one after each stage
# move, one after applying, and a check-in when they would otherwise wait too long, so most of the demo
# pipeline has heard from the team. These are left waiting on purpose, so Today shows each kind:
WAITING = frozenset({"kenji-watanabe", "arjun-mehta"})  # moved and never told; applied and never updated
NO_FOLLOW_UP = frozenset({"diego-fernandez"})  # told about each move, but nothing since his interview

STAGE_UPDATES: dict[ApplicationStage, str] = {
    ApplicationStage.SCREENING: (
        "Hi {first},\n\nThanks for applying for the {job} role. Your application has moved to screening, "
        "and I'll be in touch about next steps within a few days.\n\nBest,\nAlex"
    ),
    ApplicationStage.INTERVIEW: (
        "Hi {first},\n\nGood news: we'd like you to interview for the {job} role. I'll send the details and "
        "some notes to help you prepare shortly.\n\nBest,\nAlex"
    ),
    ApplicationStage.OFFER: (
        "Hi {first},\n\nThe team would love to make you an offer for the {job} role. I'll call you to talk it "
        "through.\n\nBest,\nAlex"
    ),
    ApplicationStage.HIRED: "Hi {first},\n\nWelcome to Encord! Your onboarding details are on their way.\n\nBest,\nAlex",
}
APPLIED_UPDATE = (
    "Hi {first},\n\nThanks for applying for the {job} role. We've received your application and the team is "
    "reviewing it. I'll update you within a week.\n\nBest,\nAlex"
)
CHECK_IN = (
    "Hi {first},\n\nA quick update on your {job} application: the team is still reviewing applications, and "
    "I'll be back in touch with next steps soon.\n\nBest,\nAlex"
)
