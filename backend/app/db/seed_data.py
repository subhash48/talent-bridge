"""The demo pipeline: the candidates, jobs, interviews and threads the recruiter dashboard shows.

Times are relative ("minutes ago", "days from today at HH:MM UTC"), so the demo always looks
current. Ported from the frontend's original mock data (frontend/services/mock/data.ts).
"""

from dataclasses import dataclass

from app.core.enums import ActivityType as A
from app.core.enums import (
    ApplicationStage,
    EngagementEventType,
    InterviewStatus,
    InterviewType,
    JobStatus,
    SenderType,
)

DAY = 24 * 60

RECRUITER = {"email": "alex.chen@encord.example", "full_name": "Alex Chen"}


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


@dataclass(frozen=True)
class VisitSeed:
    """A candidate portal visit: when it started and how long the candidate was active in it."""

    candidate: str
    started_minutes_ago: int
    active_minutes: int
    page_views: int


@dataclass(frozen=True)
class ViewSeed:
    """An explicit portal action. interview names the interview viewed, by title."""

    candidate: str
    event: EngagementEventType
    minutes_ago: int
    interview: str | None = None


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
)

E = EngagementEventType

# Sophia Martinez, the demo candidate, has been using her portal this week.
PORTAL_VISITS: tuple[VisitSeed, ...] = (
    VisitSeed("sophia-martinez", 6 * DAY, 6, 4),
    VisitSeed("sophia-martinez", 3 * DAY, 7, 5),
    VisitSeed("sophia-martinez", 1500, 8, 6),
    VisitSeed("sophia-martinez", 130, 5, 3),
)

PORTAL_VIEWS: tuple[ViewSeed, ...] = (
    ViewSeed("sophia-martinez", E.INTERVIEW_VIEWED, 3 * DAY - 5, "Design interview"),
    ViewSeed("sophia-martinez", E.APPLICATION_VIEWED, 1495),
    ViewSeed("sophia-martinez", E.PREP_VIEWED, 1440),
    ViewSeed("sophia-martinez", E.INTERVIEW_VIEWED, 126, "Design interview"),
    ViewSeed("sophia-martinez", E.MESSAGE_READ, 122),
)
