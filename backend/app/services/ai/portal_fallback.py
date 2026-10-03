"""Mock candidate assistant: deterministic, offline answers from the candidate's own record.

Used when no AI key is configured, in the tests, and as the fallback when a hosted model fails.
It only ever sees a PortalContext, and questions about feedback, evaluations, other candidates or
hiring decisions get the same boundary answer: the assistant can't see them, the recruiter can help.
"""

import re
from collections.abc import Callable

from app.schemas.portal import AssistContent, PrepContent
from app.services.ai.context import people
from app.services.ai.portal_context import PortalContext, PortalInterviewFact

# Checked in order, so the privacy boundary always wins.
TOPICS: list[tuple[str, re.Pattern[str]]] = [
    (
        "private",
        re.compile(
            r"\b(feedback|scor(e|es|ed|ing)|scorecards?|rank\w*|ratings?|rated|evaluat\w*|impressions?"
            r"|how did (i|my|it|the)|how (am i|i'?m) doing|(think|thought|felt) (of|about) (me|my)"
            r"|other (candidates?|applicants?|people)|who else|competition|how many (candidates|people|applicants)"
            r"|chances?|likel\w*|odds|(am i|are they) (going to|gonna)|will i (get|be|hear)|decision|decid\w*"
            r"|reject\w*|concerns?|internal|notes? (about|on) me|why (was|were|did|didn'?t))\b",
            re.IGNORECASE,
        ),
    ),
    (
        "questions",
        re.compile(
            r"\bquestions? (should|could|can|to|do|would)( i)? ask|\bask (the |my |an? )?(interviewers?|team|them|hiring)"
            r"|\bquestions for\b",
            re.IGNORECASE,
        ),
    ),
    (
        "process",
        re.compile(
            r"\b(process|expect\w*|be like|look like|format|how long|stages?|timeline|what happens|next steps?|rounds?)\b",
            re.IGNORECASE,
        ),
    ),
    ("review", re.compile(r"\b(review|skills?|brush up|study|topics?|read up|learn|revise)\b", re.IGNORECASE)),
    ("prepare", re.compile(r"\b(prepar\w*|prep|get ready|ready|tips?|advice|tomorrow|practi[cs]e)\b", re.IGNORECASE)),
    (
        "role",
        re.compile(
            r"\b(role|team|job|responsib\w*|focus\w*|day[- ]to[- ]day|company|culture|product|work on)\b", re.IGNORECASE
        ),
    ),
    (
        "logistics",
        re.compile(r"\b(when|what time|where|link|join|reschedul\w*|confirm\w*|calendar|address)\b", re.IGNORECASE),
    ),
]

# The timeline records the topic of a question, never the question itself. The wording reads well
# on both sides: "Asked about interview preparation" and "You asked about interview preparation".
TOPIC_LABELS = {
    "private": "application status",
    "questions": "questions for the interviewers",
    "process": "the interview process",
    "review": "what to review",
    "prepare": "interview preparation",
    "role": "the role and team",
    "logistics": "interview logistics",
    "general": "the application",
}

PROGRESS_LABELS = ("Applied", "Screening", "Interview", "Offer", "Hired")


def topic_of(question: str) -> str:
    return next((name for name, pattern in TOPICS if pattern.search(question)), "general")


def answer(context: PortalContext, question: str) -> AssistContent:
    topic = topic_of(question)
    if context.status == "closed" and topic not in ("private", "role"):
        return AssistContent(answer=_closed_answer(context))
    return AssistContent(answer=COMPOSERS[topic](context))


def prepare(context: PortalContext) -> PrepContent:
    interview = context.next_interview
    kind = interview_kind(interview.title) if interview else "general"
    return PrepContent(
        interview_format=(
            f"{interview.format}." if interview else "No interview is scheduled yet. Your recruiter will share details."
        ),
        what_to_expect=_what_to_expect(context, interview, kind),
        role_focus=_role_focus(context),
        topics_to_review=_topics_to_review(context, kind),
        company_info=context.company_facts,
        questions_to_ask=_questions_to_ask(context, interview),
        practice_questions=_practice_questions(context, kind),
    )


# Prep


def interview_kind(title: str) -> str:
    text = title.lower()
    for kind, pattern in (
        ("offer", r"offer"),
        ("system_design", r"system design|architecture"),
        ("design", r"design|portfolio|ux"),
        ("technical", r"technical|pairing|coding|engineering|infrastructure|take[- ]home"),
        ("product", r"product"),
        ("research", r"research|deep dive"),
        ("screen", r"screen|intro|recruiter|chat"),
        ("final", r"final|onsite|on-site|panel"),
    ):
        if re.search(pattern, text):
            return kind
    return "general"


EXPECT = {
    "design": [
        "A walkthrough of one or two projects from your portfolio: the problem, your process, the trade-offs and the outcome.",
        "A collaborative design exercise. The interviewers want to see how you think, not a polished final answer.",
        "Questions about how you work with product managers, engineers and researchers.",
    ],
    "system_design": [
        "An open-ended design problem: scoping it, sketching an architecture and talking through trade-offs.",
        "Follow-up questions on scale, reliability and how you'd evolve the design over time.",
    ],
    "technical": [
        "Hands-on problem solving where you talk through your reasoning as you go.",
        "A discussion of past technical work and the decisions you made along the way.",
    ],
    "product": [
        "Product sense questions: how you find user problems and decide what to build.",
        "A discussion of how you prioritise, make trade-offs and measure success.",
    ],
    "research": [
        "A deep dive into your past research: the questions, methods and results.",
        "A discussion of how research ideas make it into a product.",
    ],
    "screen": [
        "A conversation about your background, what you're looking for and why the role interests you.",
        "An overview of the role, the team and the next steps in the process.",
    ],
    "offer": [
        "A walkthrough of your offer: compensation, benefits and start date.",
        "Plenty of time for your questions before you decide.",
    ],
    "final": [
        "Conversations with several people from the team covering skills, collaboration and how you work.",
    ],
    "general": [
        "A conversation about your experience and how it relates to the role.",
    ],
}

PRACTICE = {
    "design": [
        "Walk us through a project you're proud of. What was your role, and what would you do differently?",
        "How do you build and maintain a design system that scales across teams?",
        "Tell us about a time user research changed your direction.",
        "How would you design a workflow for reviewing thousands of data items quickly and accurately?",
    ],
    "system_design": [
        "How would you design a system to process and serve large volumes of training data?",
        "Where are the bottlenecks in your design, and how would you find them?",
        "How would your design change at ten times the scale?",
    ],
    "technical": [
        "Tell us about a hard bug you tracked down. How did you approach it?",
        "Walk us through a technical decision you'd make differently today.",
        "How do you keep code reliable as a system grows?",
    ],
    "product": [
        "How would you decide what to build next for a data annotation product?",
        "Tell us about a product decision you made with incomplete data.",
        "How do you know a feature you shipped was successful?",
    ],
    "research": [
        "Walk us through a research project from question to result.",
        "How do you decide when a research idea is ready for production?",
    ],
    "screen": [
        "Tell us about yourself and what you're looking for in your next role.",
        "What would you want to achieve in your first six months?",
    ],
    "offer": [],
    "final": [
        "Tell us about a time you disagreed with a teammate. How did you resolve it?",
        "What's a piece of work you're especially proud of, and why?",
    ],
    "general": [
        "Tell us about the most relevant experience you'd bring to this role.",
    ],
}


def _what_to_expect(context: PortalContext, interview: PortalInterviewFact | None, kind: str) -> list[str]:
    if interview is None:
        return [
            f"You're at the {context.stage_label} stage. {context.next_step}",
            f"When your next interview is booked, {context.recruiter} will share the format and who you'll meet.",
        ]
    items = [f"A {interview.format}, {context.when(interview.scheduled_at)}.", *EXPECT[kind]]
    items.append("Time at the end for your own questions about the role and the team.")
    return items


def _role_focus(context: PortalContext) -> list[str]:
    items = [context.job_summary] if context.job_summary else []
    if context.job_requirements:
        items.append(f"The posting highlights {people(list(context.job_requirements))}.")
    if context.job_department:
        manager = f", with {context.hiring_manager} as hiring manager" if context.hiring_manager else ""
        items.append(f"You'd join the {context.job_department} team{manager}.")
    return items or [f"The {context.job_title} role at {context.company}."]


def _topics_to_review(context: PortalContext, kind: str) -> list[str]:
    skills = {skill.lower() for skill in context.skills}
    items = []
    if kind == "design":
        items.append("Your portfolio: pick one or two projects and practise telling each story in under ten minutes.")
    # Skills from the posting that aren't on the candidate's profile come first: they're the ones
    # the candidate is least likely to have an example ready for.
    for requirement in sorted(context.job_requirements, key=lambda item: item.lower() in skills)[:4]:
        if requirement.lower() in skills:
            items.append(f"{requirement}: have a recent, specific example ready to talk through.")
        else:
            items.append(f"{requirement}: be ready to explain how you approach it, with an example if you have one.")
    items.append(f"{context.company}'s product and the problems its customers solve.")
    return items[:6]


def _questions_to_ask(context: PortalContext, interview: PortalInterviewFact | None) -> list[str]:
    team = f"the {context.job_department} team" if context.job_department else "the team"
    items = [
        f"What does success look like in the first 90 days for this {context.job_title} role?",
        f"What are the biggest challenges {team} is working on right now?",
        "How does the team work with product, engineering and research day to day?",
        "How does the team share feedback and support growth?",
    ]
    if interview and interview.interviewers:
        items.append(
            f"For {interview.interviewers[0].split()[0]}: what do you enjoy most about working at {context.company}?"
        )
    return items


def _practice_questions(context: PortalContext, kind: str) -> list[str]:
    items = list(PRACTICE[kind])
    items += [
        f"Tell us about recent work where you used {requirement}." for requirement in context.job_requirements[:2]
    ]
    items.append(f"What draws you to the {context.job_title} role at {context.company}?")
    return list(dict.fromkeys(items))[:6]


# Answers


def _upper_first(text: str) -> str:
    return text[:1].upper() + text[1:]


def _bullets(items: list[str]) -> list[str]:
    return [f"- {item}" for item in items]


def _prepare_answer(context: PortalContext) -> str:
    interview = context.next_interview
    if interview is None:
        return "\n".join(
            [
                f"You don't have an interview scheduled right now. Here's how to stay ready for the **{context.job_title}** role:",
                "",
                *_bullets(_topics_to_review(context, "general")[:4]),
                "",
                f"{_upper_first(context.recruiter)} will share the details as soon as your next interview is booked.",
            ]
        )
    kind = interview_kind(interview.title)
    tips = ["Have two or three questions ready for the interviewers."]
    if interview.interview_type == "video":
        tips.insert(0, "Test your camera, microphone and the meeting link a few minutes early.")
    if interview.can_confirm:
        tips.insert(0, "Confirm your interview from **Interviews** so the team knows you're set.")
    return "\n".join(
        [
            f"Here's how to get ready for your **{interview.title}** {context.when(interview.scheduled_at)}:",
            "",
            "**What to expect**",
            *_bullets(EXPECT[kind][:3]),
            "",
            "**Worth reviewing**",
            *_bullets(_topics_to_review(context, kind)[:4]),
            "",
            "**Practical tips**",
            *_bullets(tips),
        ]
    )


def _process_answer(context: PortalContext) -> str:
    steps = [f"**{label}** (you're here)" if label == context.stage_label else label for label in PROGRESS_LABELS]
    lines = [
        f"Here's how hiring works for the **{context.job_title}** role at {context.company}:",
        "",
        *(f"{index}. {step}" for index, step in enumerate(steps, start=1)),
        "",
        context.next_step,
    ]
    interview = context.next_interview
    if interview:
        kind = interview_kind(interview.title)
        lines += [
            "",
            f"Your next interview is the **{interview.title}** {context.when(interview.scheduled_at)}.",
            *_bullets(EXPECT[kind][:2]),
        ]
    lines += ["", f"After each interview, {context.recruiter} will be in touch about next steps."]
    return "\n".join(lines)


def _questions_answer(context: PortalContext) -> str:
    interview = context.next_interview
    intro = (
        f"Good questions show genuine interest. A few to consider for your **{interview.title}**:"
        if interview
        else "Good questions show genuine interest. A few to consider for your next conversation with the team:"
    )
    return "\n".join(
        [
            intro,
            "",
            *_bullets(_questions_to_ask(context, interview)),
            "",
            (
                "Pick the two or three you're most curious about. Follow-up questions on their answers often "
                "lead to the best conversations."
            ),
        ]
    )


def _review_answer(context: PortalContext) -> str:
    interview = context.next_interview
    kind = interview_kind(interview.title) if interview else "general"
    return "\n".join(
        [
            f"Based on the **{context.job_title}** posting"
            + (f" and your upcoming {interview.title}" if interview else "")
            + ", these are worth reviewing:",
            "",
            *_bullets(_topics_to_review(context, kind)),
            "",
            "Concrete examples from your own work will make the strongest impression.",
        ]
    )


def _role_answer(context: PortalContext) -> str:
    lines = [f"**{context.job_title}** at {context.company}", ""]
    if context.job_summary:
        lines += [context.job_summary, ""]
    details = [
        f"**Team:** {context.job_department}" if context.job_department else None,
        f"**Location:** {context.job_location}" if context.job_location else None,
        f"**Type:** {context.employment_type}",
        f"**Hiring manager:** {context.hiring_manager}" if context.hiring_manager else None,
        f"**Skills in the posting:** {', '.join(context.job_requirements)}" if context.job_requirements else None,
    ]
    lines += _bullets([item for item in details if item])
    if context.company_overview:
        lines += ["", context.company_overview]
    return "\n".join(lines)


def _logistics_answer(context: PortalContext) -> str:
    interview = context.next_interview
    if interview is None:
        return (
            "You don't have an interview scheduled right now. "
            f"{_upper_first(context.recruiter)} will share the time, format and who you'll meet as soon as one is booked."
        )
    if interview.confirmed:
        status = "Confirmed"
    elif interview.can_confirm:
        status = "Not confirmed yet. You can confirm it from **Interviews**."
    else:
        status = "Scheduled"
    details = [
        f"**Format:** {interview.format}",
        f"**Status:** {status}",
    ]
    if interview.interview_type == "video":
        details.append("**Joining:** use the meeting link on the **Interviews** page.")
    return "\n".join(
        [
            f"Your **{interview.title}** is {context.when(interview.scheduled_at)}.",
            "",
            *_bullets(details),
            "",
            f"Need to reschedule? Message {context.recruiter} from **Messages**.",
        ]
    )


def _private_answer(context: PortalContext) -> str:
    return "\n".join(
        [
            (
                "I don't have access to the hiring team's internal feedback, evaluations or decisions, and I can't "
                "compare you with other candidates. That keeps the process fair for everyone."
            ),
            "",
            (
                f"Your application is at the **{context.stage_label}** stage. {_upper_first(context.recruiter)} "
                "is the best person to ask about where things stand, and you can message them from **Messages**."
            ),
            "",
            (
                "In the meantime, I'm happy to help you prepare: ask me what to expect, what to review or which "
                "questions to ask."
            ),
        ]
    )


def _general_answer(context: PortalContext) -> str:
    return "\n".join(
        [
            (
                f"Your **{context.job_title}** application at {context.company} is at the "
                f"**{context.stage_label}** stage. {context.next_step}"
            ),
            "",
            "I can help you with:",
            *_bullets(
                [
                    "What to expect in your interviews",
                    "What to review beforehand",
                    "Questions to ask the interviewers",
                    "How the hiring process works",
                ]
            ),
        ]
    )


def _closed_answer(context: PortalContext) -> str:
    return (
        f"Your application for the **{context.job_title}** role is closed. Thank you for the time and care you put "
        f"into the process. If you have questions, {context.recruiter} is happy to help via **Messages**."
    )


COMPOSERS: dict[str, Callable[[PortalContext], str]] = {
    "private": _private_answer,
    "questions": _questions_answer,
    "process": _process_answer,
    "review": _review_answer,
    "prepare": _prepare_answer,
    "role": _role_answer,
    "logistics": _logistics_answer,
    "general": _general_answer,
}
