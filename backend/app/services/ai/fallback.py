"""Mock provider: deterministic, offline answers composed from the candidate context.

Used when no AI key is configured, in the tests, and as the automatic fallback when Gemini or
Groq fails, so the recruiter always gets a grounded answer. It never recommends rejecting anyone.
The candidate assistant's answers live in portal_fallback, which only sees a PortalContext.
Job postings for demo jobs are composed from the recruiter's brief alone.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.core.enums import ActivityType, ApplicationStage, SenderType
from app.schemas.ai import (
    AnalysisContent,
    AskContent,
    DraftContent,
    DraftPurpose,
    SkillEvidence,
)
from app.schemas.demo import MAX_ABOUT_ROLE, MAX_ABOUT_TEAM, MAX_SUMMARY, JobPostingBrief, JobPostingContent, clean_list
from app.schemas.portal import AssistContent, PrepContent
from app.services.ai import portal_fallback
from app.services.ai.client import AIProvider
from app.services.ai.context import (
    CandidateContext,
    InterviewFact,
    ago,
    people,
    when,
)
from app.services.ai.portal_context import PortalContext

FORMATS = {"video": "over video", "phone": "by phone", "onsite": "at our office"}

INTENTS: list[tuple[str, re.Pattern[str]]] = [
    (
        "strengths",
        re.compile(r"strong|strength|reasons?|why (should|would|interview|hire)|stand out|good fit|best fit"),
    ),
    ("concerns", re.compile(r"concern|risk|gap|weak|red flag|worr|missing|lack")),
    ("draft", re.compile(r"draft|write|e-?mail|message|follow[- ]?up|reach out|reply")),
    ("summary", re.compile(r"summar|overview|profile|tell me about|who is|background")),
    ("next_steps", re.compile(r"next step|what should|recommend|suggest|plan|do next")),
    ("interview", re.compile(r"interview|brief|prep|question")),
]


class MockProvider(AIProvider):
    name = "mock"
    model = "mock"

    async def analyze_candidate(self, context: CandidateContext) -> AnalysisContent:
        matched, missing = match_requirements(context)
        return AnalysisContent(
            summary=_summary(context, matched, missing),
            skills_matched=matched,
            missing_skills=missing,
            strengths=_strengths(context, matched),
            concerns=_concerns(context, missing),
            suggested_questions=_questions(context, matched, missing),
            recommended_next_step=_next_step(context, missing),
        )

    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        text = question.lower()
        intent = next((name for name, pattern in INTENTS if pattern.search(text)), "general")
        return COMPOSERS[intent](context)

    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        if purpose == DraftPurpose.INTERVIEW_INVITATION:
            return _invitation(context, instructions or "")
        if purpose == DraftPurpose.CUSTOM:
            return _custom(context, instructions or "")
        return _draft(context, purpose)

    async def assist_candidate(self, context: PortalContext, question: str) -> AssistContent:
        return portal_fallback.answer(context, question)

    async def prepare_candidate(self, context: PortalContext) -> PrepContent:
        return portal_fallback.prepare(context)

    async def write_job_posting(self, brief: JobPostingBrief, organization: str, overview: str) -> JobPostingContent:
        return _job_posting(brief, organization, overview)


# Analysis


def match_requirements(context: CandidateContext) -> tuple[list[SkillEvidence], list[str]]:
    matched: list[SkillEvidence] = []
    missing: list[str] = []
    for requirement in context.job_requirements:
        evidence = _evidence_for(context, requirement)
        if evidence:
            matched.append(SkillEvidence(skill=requirement, evidence=evidence))
        else:
            missing.append(requirement)
    return matched, missing


def _mentions(text: str, term: str) -> bool:
    return re.search(rf"\b{re.escape(term)}\b", text, re.IGNORECASE) is not None


def _evidence_for(context: CandidateContext, requirement: str) -> str | None:
    for interview in context.completed_interviews:
        if interview.notes and _mentions(interview.notes, requirement):
            return f"{interview.title} feedback: “{interview.notes}”"
    for skill in context.skills:
        if _mentions(skill, requirement) or _mentions(requirement, skill):
            return f"Listed on {context.first_name}'s profile as “{skill}”."
    if context.headline and _mentions(context.headline, requirement):
        return f"Mentioned in {context.their} headline: “{context.headline}”."
    return None


def _summary(context: CandidateContext, matched: list[SkillEvidence], missing: list[str]) -> str:
    where = f", based in {context.location}" if context.location else ""
    parts = [f"{context.name}{where}, is at the {context.stage.label} stage for {context.job_title}."]
    total = len(context.job_requirements)
    if total:
        evidenced = f"{len(matched)} of {total} listed requirements have evidence in the record"
        parts.append(f"{evidenced}; {_join(missing)} still need evidence." if missing else f"{evidenced}.")
    else:
        parts.append("The job lists no requirements, so skills weren't compared.")
    if context.follow_up_reason:
        parts.append(f"Needs follow-up: {_lower_first(context.follow_up_reason)}.")
    return " ".join(parts)


def _strengths(context: CandidateContext, matched: list[SkillEvidence]) -> list[str]:
    items: list[str] = []
    if matched:
        items.append(
            f"Evidence for {len(matched)} of {len(context.job_requirements)} requirements: "
            f"{_join([m.skill for m in matched])}."
        )
    for interview in context.completed_interviews:
        if interview.notes:
            items.append(f"{interview.title}: {interview.notes}")
    if context.candidate_questions:
        items.append(f"Shows interest in the role: {_lower_first(context.candidate_questions[0].title)}.")
    extra = [
        skill
        for skill in context.skills
        if not any(_mentions(skill, m.skill) or _mentions(m.skill, skill) for m in matched)
    ]
    if extra and context.job_requirements:
        items.append(f"Also brings {_join(extra)}.")
    if not items:
        items.append(
            f"Profile lists {_join(list(context.skills))}."
            if context.skills
            else "The record doesn't show strengths yet; a first conversation will help."
        )
    return items[:5]


def _concerns(context: CandidateContext, missing: list[str]) -> list[str]:
    items: list[str] = []
    if missing:
        items.append(f"No evidence yet for {_join(missing)}; worth probing in the next conversation.")
    if context.follow_up_reason:
        items.append(f"Needs attention: {_lower_first(context.follow_up_reason)}.")
    reschedule = next((a for a in context.activities if a.type == ActivityType.INTERVIEW_RESCHEDULE_REQUESTED), None)
    if reschedule:
        items.append(f"Asked to reschedule an interview {ago(reschedule.at, context.now)}.")
    if "feedback" not in (context.follow_up_reason or "").lower():
        for interview in context.completed_interviews:
            if not interview.notes:
                items.append(f"No feedback recorded for the {interview.title.lower()} yet.")
    return items


def _questions(context: CandidateContext, matched: list[SkillEvidence], missing: list[str]) -> list[str]:
    questions = [
        f"Can you walk us through recent work that involved {skill}? What was your part in it?" for skill in missing[:2]
    ]
    if matched:
        questions.append(
            f"What's the hardest {matched[0].skill} problem you've worked on, and what trade-offs did you make?"
        )
    questions.append(f"What draws you to the {context.job_title} role at {context.organization}?")
    asked = next((a.title for a in context.candidate_questions if a.title.lower().startswith("asked about ")), None)
    if asked:
        questions.append(f"You asked about {asked[len('asked about ') :]}. Is there anything else you'd like to know?")
    return questions[:5]


def _next_step(context: CandidateContext, missing: list[str]) -> str:
    first = context.first_name
    upcoming = context.upcoming_interview
    if context.follow_up_reason:
        return f"Follow up with {first} today: {_lower_first(context.follow_up_reason)}."
    match context.stage:
        case ApplicationStage.SOURCED:
            return f"Send {first} a personal note about the {context.job_title} role and offer a short intro call."
        case ApplicationStage.SCREENING:
            if upcoming:
                return f"Prepare {people(upcoming.interviewers)} for the {upcoming.title.lower()} {when(upcoming.scheduled_at, context.now)}."
            return f"Book a screening call with {first} while interest is fresh."
        case ApplicationStage.INTERVIEW:
            if upcoming:
                focus = f", and agree who covers {_join(missing[:2])}" if missing else ""
                return (
                    f"Brief {people(upcoming.interviewers)} before the {upcoming.title.lower()} "
                    f"{when(upcoming.scheduled_at, context.now)}{focus}."
                )
            return f"Hold a debrief with the hiring team to agree the next step for {first}."
        case ApplicationStage.OFFER:
            return f"Check in with {first} on the offer and agree a decision date."
        case ApplicationStage.HIRED:
            return f"Send {first} the onboarding pack and confirm {context.their} start date."
        case _:
            return "No action needed: the application is closed unless you reopen it."


# Answers


def _summary_answer(context: CandidateContext) -> AskContent:
    where = f" based in {context.location}" if context.location else ""
    lines = [
        f"**{context.name}** is a {context.job_title} candidate{where}, currently in the **{context.stage.label}** stage.",
        "",
        f"- **Recent activity:** {_recent(context, 2)}." if context.activities else "- **Recent activity:** none yet.",
    ]
    if context.skills:
        lines.append(f"- **Skills:** {', '.join(context.skills)}.")
    lines.append(f"- **Next step:** {_next_step_line(context)}")
    if context.candidate_questions:
        lines.append(f"- **Worth covering:** {_lower_first(context.candidate_questions[0].title)}.")
    if context.follow_up_reason:
        lines.append(f"- **Needs attention:** {context.follow_up_reason}.")
    lines.append("")
    if context.follow_up_reason:
        lines.append(f"I'd follow up today so {context.first_name} isn't left waiting.")
    else:
        lines.append("Nothing is waiting on you right now.")
    return AskContent(answer="\n".join(lines), sources=context.sources("profile", "activity", "interviews"))


def _next_steps_answer(context: CandidateContext) -> AskContent:
    first = context.first_name
    upcoming = context.upcoming_interview
    _, missing = match_requirements(context)
    steps: list[str] = []
    if context.follow_up_reason:
        steps.append(f"**Act today:** {_lower_first(context.follow_up_reason)}.")
    last = context.last_message
    if last and last.sender == SenderType.CANDIDATE:
        steps.append(f'**Reply to {first}\'s latest message:** "{last.content}"')
    match context.stage:
        case ApplicationStage.SOURCED:
            steps += [
                f"**Send a personal outreach message** about the {context.job_title} role.",
                f"**Share the role overview** so {first} can see the team and the problems they'd work on.",
                "**Follow up in 3 days** if there's no reply. I can draft both messages.",
            ]
        case ApplicationStage.SCREENING:
            steps.append(
                f"**Prepare {people(upcoming.interviewers)}** for the {upcoming.title.lower()} {when(upcoming.scheduled_at, context.now)}."
                if upcoming
                else "**Book a hiring-manager screen** while the conversation is fresh."
            )
            steps.append(f"**Send {first} a short update** on what happens next and when.")
        case ApplicationStage.INTERVIEW:
            if upcoming:
                steps.append(
                    f"**Brief {people(upcoming.interviewers)}** before the {upcoming.title.lower()} "
                    f"{when(upcoming.scheduled_at, context.now)}"
                    + (f"; cover {_join(missing[:2])}, which the record doesn't evidence yet." if missing else ".")
                )
                steps.append("**Plan the debrief:** collect written feedback within 24 hours.")
            else:
                steps += [
                    "**Book a debrief** with the hiring team to agree next steps.",
                    f"**Update {first}** on timing so the process doesn't go quiet.",
                ]
        case ApplicationStage.OFFER:
            steps += [
                f"**Check in on the offer** and agree a decision date with {first}.",
                "**Be ready on equity, benefits and start date**, the usual questions at this stage.",
            ]
        case ApplicationStage.HIRED:
            steps += [
                f"**Send the onboarding pack** and confirm {context.their} start date.",
                f"**Introduce {first} to the team** and assign an onboarding buddy.",
            ]
        case _:
            steps.append("**No action needed.** The application is closed unless you reopen it.")
    numbered = [f"{index}. {step}" for index, step in enumerate(steps[:4], start=1)]
    return AskContent(
        answer="\n".join([f"Here's what I'd do next for {first}:", "", *numbered]),
        sources=context.sources("profile", "activity", "interviews", "messages"),
    )


def _draft_answer(context: CandidateContext) -> AskContent:
    draft = _draft(context, DraftPurpose.FOLLOW_UP)
    return AskContent(
        answer=f"Here's a draft you can edit before sending:\n\n**Subject:** {draft.subject}\n\n{draft.body}",
        sources=context.sources("profile", "interviews", "messages"),
    )


def _interview_answer(context: CandidateContext) -> AskContent:
    upcoming = context.upcoming_interview
    matched, missing = match_requirements(context)
    header = f"Interview brief for **{context.name}**"
    if upcoming:
        header += f": {upcoming.title}, {when(upcoming.scheduled_at, context.now)}"
    focus = missing[:3] or [m.skill for m in matched[:3]] or list(context.skills[:3])
    lines = [
        f"{header}.",
        "",
        f"- **Focus areas:** {_join(focus) if focus else 'role fundamentals'}.",
        f"- **Already evidenced:** {_join([m.skill for m in matched]) if matched else 'nothing yet'}.",
        f"- **Candidate questions:** {'; '.join(_lower_first(q.title) for q in context.candidate_questions) or 'none raised yet'}.",
    ]
    if context.activities:
        lines.append(f"- **Recent signals:** {_recent(context, 2)}.")
    if upcoming:
        lines.append(
            f"- **Logistics:** {upcoming.duration_minutes} min, {FORMATS.get(upcoming.interview_type, upcoming.interview_type)}, "
            f"with {people(upcoming.interviewers)}."
        )
    for interview in context.completed_interviews[:1]:
        if interview.notes:
            lines.append(f"- **Earlier feedback ({interview.title}):** {interview.notes}")
    return AskContent(answer="\n".join(lines), sources=context.sources("profile", "job", "activity", "interviews"))


def _strengths_answer(context: CandidateContext) -> AskContent:
    matched, missing = match_requirements(context)
    reasons = _strengths(context, matched)
    lines = [f"The strongest reasons to interview {context.first_name}, from the record:", ""]
    lines += [f"{index}. {reason}" for index, reason in enumerate(reasons, start=1)]
    if matched:
        lines += ["", "**Evidence by requirement:**", *(f"- **{m.skill}:** {m.evidence}" for m in matched[:4])]
    if missing:
        lines += ["", f"**Still to confirm:** {_join(missing)}. Worth covering in the interview."]
    return AskContent(answer="\n".join(lines), sources=context.sources("profile", "job", "activity", "interviews"))


def _concerns_answer(context: CandidateContext) -> AskContent:
    _, missing = match_requirements(context)
    concerns = _concerns(context, missing)
    if not concerns:
        answer = f"Nothing in {context.first_name}'s record raises a concern so far."
    else:
        answer = "\n".join(
            [f"Things to check for {context.first_name}:", "", *(f"- {concern}" for concern in concerns)]
        )
    return AskContent(answer=answer, sources=context.sources("profile", "job", "activity", "interviews"))


def _general_answer(context: CandidateContext) -> AskContent:
    latest = context.activities[0] if context.activities else None
    lines = [
        f"Here's the latest on **{context.name}** ({context.job_title}, {context.stage.label}):",
        "",
        f"- **Last activity:** {latest.title}, {ago(latest.at, context.now)}."
        if latest
        else "- **Last activity:** none yet.",
        f"- **Next step:** {_next_step_line(context)}",
        "",
        (
            f"I can summarize {context.their} profile, list strengths and gaps, suggest next steps, "
            "draft a message, or prepare an interview brief."
        ),
    ]
    return AskContent(answer="\n".join(lines), sources=context.sources("profile", "activity"))


COMPOSERS = {
    "summary": _summary_answer,
    "next_steps": _next_steps_answer,
    "draft": _draft_answer,
    "interview": _interview_answer,
    "strengths": _strengths_answer,
    "concerns": _concerns_answer,
    "general": _general_answer,
}


# Drafts


def _draft(context: CandidateContext, purpose: DraftPurpose) -> DraftContent:
    first = context.first_name
    role = context.job_title
    upcoming = context.upcoming_interview
    focus = _join([s.lower() for s in context.skills[:2]]) or "your background"

    if purpose == DraftPurpose.FOLLOW_UP:
        purpose = {
            ApplicationStage.SOURCED: DraftPurpose.OUTREACH,
            ApplicationStage.OFFER: DraftPurpose.OFFER_CHECK_IN,
        }.get(context.stage, DraftPurpose.INTERVIEW_CONFIRMATION if upcoming else DraftPurpose.STATUS_UPDATE)

    if purpose == DraftPurpose.OUTREACH:
        subject = f"{role} at {context.organization}"
        text = (
            f"I came across your work in {focus} and thought you'd be a great fit for our {role} role. "
            "The team is growing, and I'd love to tell you more.\n\nWould you be open to a 20-minute chat this week?"
        )
    elif purpose == DraftPurpose.INTERVIEW_CONFIRMATION and upcoming:
        subject = f"Your {upcoming.title.lower()} {when(upcoming.scheduled_at, context.now)}"
        text = (
            f"Looking forward to your {upcoming.title.lower()} {when(upcoming.scheduled_at, context.now)} "
            f"with {people(upcoming.interviewers)}. It's {upcoming.duration_minutes} minutes "
            f"{FORMATS.get(upcoming.interview_type, '')}, and the conversation will focus on {focus}.\n\n"
            "If anything comes up, just reply here."
        )
    elif purpose == DraftPurpose.OFFER_CHECK_IN:
        subject = "Checking in on your offer"
        text = (
            "I wanted to check in on the offer and see if you have any questions. I'm happy to set up a call "
            "with the hiring team to go through equity, benefits or anything else."
        )
    else:
        past = _latest_completed(context)
        subject = f"An update on your {role} application"
        text = (
            f"Thanks again for your time in the {past.title.lower()}. The team is finishing their feedback, "
            "and I'll come back to you with next steps shortly."
            if past
            else "Thanks for your time so far. I'll be in touch about next steps in the next few days.\n\n"
            "In the meantime, let me know if you have any questions about the role or the team."
        )
    body = f"Hi {first},\n\n{text}\n\nBest,\n{context.recruiter_first_name}"
    return DraftContent(subject=subject, body=body)


def _invitation(context: CandidateContext, instructions: str) -> DraftContent:
    """An interview invitation from the details in the recruiter's request: its type, length and timing.
    It asks for times rather than inventing a date or a scheduling link."""
    from app.services.assistant.rules import interview_details

    details = interview_details(instructions)
    kind = (details.interview_type or "interview").lower()
    length = f"{details.duration_minutes}-minute " if details.duration_minutes else ""
    timing = f" {details.timeframe}" if details.timeframe else ""
    article = "an" if (length or kind)[0] in "aeiou8" else "a"
    text = (
        f"Thanks again for your interest in the {context.job_title} role. We'd love to continue the conversation "
        f"with {article} {length}{kind}{timing}.\n\n"
        "Please reply here with a few times that work best for you, and I'll send over a calendar invitation."
    )
    body = f"Hi {context.first_name},\n\n{text}\n\nBest,\n{context.recruiter_first_name}"
    return DraftContent(subject=f"Scheduling your {kind} for the {context.job_title} role", body=body)


_TELL = re.compile(
    r"^.*?\b(?:telling|tell|letting|let|informing|inform)\s+[A-Z][\w'-]*(?:\s+know)?(?:\s+that)?\s+", re.DOTALL
)
_BE = {"is": "are", "was": "were", "has": "have"}
_SWAPS: tuple[tuple[re.Pattern[str], str | Callable[[re.Match[str]], str]], ...] = (
    (re.compile(r"\b(he|she|they) (is|was|has)\b", re.IGNORECASE), lambda match: f"you {_BE[match.group(2).lower()]}"),
    (re.compile(r"\b(his|her|their)\b", re.IGNORECASE), "your"),
    (re.compile(r"\b(he|she|they|him|them)\b", re.IGNORECASE), "you"),
)


def _custom(context: CandidateContext, instructions: str) -> DraftContent:
    """A short message saying what the recruiter asked for ("telling Daniel his interview moved to
    Thursday"), in the second person."""
    match = _TELL.match(instructions.strip())
    point = instructions.strip()[match.end() :].rstrip(" .!") if match else ""
    for pattern, swap in _SWAPS:
        point = pattern.sub(swap, point)
    if point:
        text = f"I wanted to let you know {point[0].lower() + point[1:]}."
    else:
        text = f"I wanted to follow up about your application for the {context.job_title} role."
    text += "\n\nIf you have any questions, just reply here."
    body = f"Hi {context.first_name},\n\n{text}\n\nBest,\n{context.recruiter_first_name}"
    return DraftContent(subject=f"An update on your {context.job_title} application", body=body)


# Job postings


@dataclass(frozen=True)
class RoleFamily:
    """How the mock job writer describes one kind of role. The job title picks it (ROLE_FAMILIES)."""

    team: str  # what a manager in this family leads
    work: str  # what the role does, after "you'll"; may name {organization}
    collaboration: str  # who the role works with, and how; may name {organization}
    impact: str  # why the work matters, without claims about the company
    responsibilities: tuple[str, ...]
    fundamentals: str  # the requirement that changes with seniority: entry level
    practice: str  # mid level
    track_record: str  # senior and above
    preferred: str
    skills: tuple[str, ...]  # suggested when the brief lists fewer than three


MACHINE_LEARNING_ROLE = RoleFamily(
    team="a machine learning team",
    work="build, evaluate and ship machine learning systems",
    collaboration=(
        "You'll work closely with product managers, engineers and researchers to decide what to build, then take "
        "it from experiment to production."
    ),
    impact="The models you build will shape how well the product works for the people who use it.",
    responsibilities=(
        "Build, train and evaluate machine learning models for real product use cases.",
        "Turn experiments into reliable production services, with the monitoring to keep them healthy.",
        "Build the data pipelines and evaluation sets that show whether a model is improving.",
        "Work with product and engineering teammates to decide what to build and how to measure success.",
        "Document experiments and results so the whole team can build on them.",
    ),
    fundamentals="A grasp of machine learning fundamentals: training, evaluation and common model architectures.",
    practice="Experience taking machine learning models from experiment to production.",
    track_record="A track record of shipping machine learning systems that people rely on.",
    preferred="Experience with large-scale data processing or distributed training.",
    skills=("Python", "Machine learning", "Model evaluation"),
)

ENGINEERING_ROLE = RoleFamily(
    team="an engineering team",
    work="design, build and run the software behind {organization}'s product",
    collaboration=(
        "You'll work closely with product managers, designers and other engineers, from scoping a problem to "
        "shipping and running the solution."
    ),
    impact="The systems you build will shape how reliably and quickly the product works for the people who use it.",
    responsibilities=(
        "Design, build and maintain production features end to end.",
        "Write clear, well-tested code and review your teammates' changes.",
        "Monitor, debug and improve the reliability and performance of the systems you own.",
        "Work with product and design to scope problems and agree on solutions.",
        "Document your work and share what you learn with the team.",
    ),
    fundamentals="A grasp of software fundamentals such as data structures, testing and version control.",
    practice="Experience shipping and maintaining production software, including testing and code review.",
    track_record="A track record of designing, shipping and running production systems.",
    preferred="Experience with cloud infrastructure and production monitoring.",
    skills=("Software engineering", "Testing", "Debugging"),
)

DESIGN_ROLE = RoleFamily(
    team="a design team",
    work="design clear, usable experiences for the people who use {organization}'s product",
    collaboration=(
        "You'll work closely with product managers, engineers and researchers, from early research and concepts to "
        "polished, production-ready designs."
    ),
    impact="Your designs will shape how people get their work done in the product every day.",
    responsibilities=(
        "Design end-to-end workflows, from early concepts to production-ready designs.",
        "Prototype and test ideas with users, and turn what you learn into better designs.",
        "Contribute to a consistent, well-documented design system.",
        "Work with engineers through delivery so the details ship as intended.",
        "Present your work and the reasoning behind it to the wider team.",
    ),
    fundamentals="A portfolio, from work, study or personal projects, that shows how you approach design problems.",
    practice="A portfolio of shipped work that shows your process as well as the result.",
    track_record="A portfolio of shipped work that shows strong craft and clear reasoning on complex problems.",
    preferred="Experience designing data-heavy or technical tools.",
    skills=("Interaction design", "Prototyping", "User research"),
)

PRODUCT_ROLE = RoleFamily(
    team="a product team",
    work="decide what {organization} builds next, and see it through to launch",
    collaboration=(
        "You'll work closely with engineering, design and customer-facing teams to understand problems, set "
        "priorities and ship."
    ),
    impact="Your decisions will shape what the product does next for the people who rely on it.",
    responsibilities=(
        "Talk to customers and users to understand their problems and the outcomes they need.",
        "Own the roadmap for your area, and explain the reasoning behind your priorities.",
        "Write clear product requirements, and work with engineering and design through delivery.",
        "Define how success is measured, track it after launch and act on what you learn.",
        "Keep stakeholders across the company informed and aligned.",
    ),
    fundamentals="A structured approach to breaking down problems and making decisions with data.",
    practice="Experience owning a product area from discovery through launch.",
    track_record="A track record of shipping products that customers rely on.",
    preferred="Experience with B2B or technical products.",
    skills=("Product discovery", "Roadmapping", "Analytics"),
)

GENERAL_ROLE = RoleFamily(
    team="a team",
    work="own important work end to end and help shape how the team operates",
    collaboration=(
        "You'll work closely with teammates across {organization}, planning, delivering and improving the work your "
        "team owns."
    ),
    impact="Your work will make a visible difference to the team and the people it serves.",
    responsibilities=(
        "Own projects from planning through delivery, and keep everyone informed along the way.",
        "Work with teammates across the company to understand needs and agree on priorities.",
        "Improve the processes and tools the team relies on.",
        "Track results, and use what you learn to improve how the team works.",
        "Document your work so others can pick it up and build on it.",
    ),
    fundamentals="Strong organisation, and care for the details of your work.",
    practice="Experience delivering projects from planning through completion.",
    track_record="A track record of leading complex projects to successful outcomes.",
    preferred="Experience working with technical teams.",
    skills=("Communication", "Project management", "Collaboration"),
)

# Checked in order: "ML Product Manager" is a product role, "Design Engineer" an engineering one.
ROLE_FAMILIES: list[tuple[re.Pattern[str], RoleFamily]] = [
    (re.compile(r"\bproduct (manager|owner|lead|director)\b|\bhead of product\b", re.IGNORECASE), PRODUCT_ROLE),
    (
        re.compile(
            r"\b(ml|ai|machine learning|deep learning|data scien\w*|computer vision|nlp"
            r"|research (scientist|engineer)|applied scientist)\b",
            re.IGNORECASE,
        ),
        MACHINE_LEARNING_ROLE,
    ),
    (re.compile(r"\b(engineer\w*|developer|devops|sre|programmer|architect)\b", re.IGNORECASE), ENGINEERING_ROLE),
    (re.compile(r"\b(design\w*|ux|ui)\b", re.IGNORECASE), DESIGN_ROLE),
]

LEVEL_PREFIXES = {
    "Entry Level": "entry-level",
    "Mid Level": "mid-level",
    "Senior": "senior",
    "Staff": "staff",
    "Principal": "principal",
}
LEVEL_SENTENCES = {
    "Internship": (
        "As an intern, you'll work on real projects with support from the team, and learn how it plans, builds "
        "and ships."
    ),
    "Entry Level": (
        "It's an entry-level role: you'll learn the product and the domain with support from the team, and take on "
        "more ownership as you grow."
    ),
    "Mid Level": "You'll own projects from start to finish and help shape how the team works.",
    "Senior": "You'll lead projects from start to finish, set direction for your area and help others grow.",
    "Staff": "You'll set direction across teams, take on the most complex problems and help others grow.",
    "Principal": (
        "You'll shape direction across the organisation, take on the hardest problems and raise the bar for "
        "everyone around you."
    ),
    "Manager": "You'll lead and grow the team, set priorities with stakeholders and help everyone do their best work.",
    "Director": (
        "You'll lead several teams, set strategy and priorities with leadership, and develop the managers who "
        "report to you."
    ),
}
ENTRY_LEVELS = frozenset({"Internship", "Entry Level"})
SENIOR_LEVELS = frozenset({"Senior", "Staff", "Principal"})
LEAD_LEVELS = frozenset({"Manager", "Director"})
# A manager's or director's work is the team's, whatever the discipline.
LEAD_RESPONSIBILITIES = (
    "Lead, support and grow the team through hiring, regular one-to-ones, feedback and career development.",
    "Set goals and priorities with stakeholders, and keep the team focused on what matters most.",
    "Make sure the team delivers high-quality work reliably and at a sustainable pace.",
    "Improve how the team plans, collaborates and shares what it learns.",
    "Represent the team's work and needs across the company.",
)

_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")


def _job_posting(brief: JobPostingBrief, organization: str, overview: str) -> JobPostingContent:
    """A complete draft from the brief alone: the recruiter's notes, title, level, team, location and
    skills, and the company overview for About the team. It states nothing else about the company."""
    family = next((family for pattern, family in ROLE_FAMILIES if pattern.search(brief.title)), GENERAL_ROLE)
    role = _level_title(brief)
    opening = f"{organization} is hiring {_article(role)} {role}"
    if brief.department:
        opening += f" to join the {_team(brief.department)}"
    if brief.location and brief.location.lower() != "remote":
        opening += f" in {brief.location}"
    work = family.work.format(organization=organization)
    team = [f"You'll join the {_team(brief.department)} at {organization}." if brief.department else ""]
    team += _SENTENCE_BREAK.split(overview.strip())
    return JobPostingContent(
        summary=_fit([f"{opening}.", f"In this {_arrangement(brief)}, you'll {work}."], MAX_SUMMARY),
        about_role=_fit(
            [
                _as_sentence(brief.notes) if brief.notes else "",
                family.collaboration.format(organization=organization),
                family.impact,
                LEVEL_SENTENCES.get(brief.seniority or "", ""),
            ],
            MAX_ABOUT_ROLE,
        ),
        responsibilities=list(LEAD_RESPONSIBILITIES if brief.seniority in LEAD_LEVELS else family.responsibilities),
        requirements=_requirements(brief, family),
        preferred_qualifications=_preferred(brief, family, organization),
        skills=clean_list([*brief.skills, *family.skills])[: max(len(brief.skills), 3)],
        about_team=_fit([sentence for sentence in team if sentence][:3], MAX_ABOUT_TEAM) or None,
    )


def _requirements(brief: JobPostingBrief, family: RoleFamily) -> list[str]:
    """Matched to the level. Only the recruiter's skills are named: a suggested one is just a suggestion."""
    title, level = brief.title, brief.seniority
    primary, secondary = _join(brief.skills[:2]), _join(brief.skills[2:5])
    if level in ENTRY_LEVELS:
        items = [
            f"Working knowledge of {primary}, from work, internships, projects or study."
            if primary
            else f"Experience relevant to the {title} role, from work, internships, projects or study.",
            f"Familiarity with {secondary}, or the drive to pick {'them' if len(brief.skills) > 3 else 'it'} up quickly."
            if secondary
            else "",
            family.fundamentals,
            "Clear written and spoken communication, and the confidence to ask questions.",
            "A habit of learning from feedback and sharing what you learn.",
        ]
    elif level in LEAD_LEVELS:
        items = [
            "Experience leading several teams and the managers who run them."
            if level == "Director"
            else f"Experience leading and growing {family.team}: hiring, coaching and developing people.",
            f"A strong background in {primary}." if primary else family.track_record,
            "Experience setting goals and priorities with stakeholders across the company.",
            "A track record of building teams where everyone can do their best work.",
            "Clear written and spoken communication.",
        ]
    elif level in SENIOR_LEVELS:
        items = [
            f"Extensive professional experience with {primary}."
            if primary
            else f"Extensive experience as {_article(title)} {title} or in a similar role.",
            f"Deep, hands-on experience with {secondary}." if secondary else "",
            family.track_record,
            "Experience leading projects across teams and mentoring others.",
            "Clear written and spoken communication, including written proposals.",
        ]
    else:  # mid level, or not given
        items = [
            f"Professional experience with {primary}."
            if primary
            else f"Professional experience as {_article(title)} {title} or in a similar role.",
            f"Hands-on experience with {secondary}." if secondary else "",
            family.practice,
            "The ability to take a project from idea to delivery with little guidance.",
            "Clear written and spoken communication.",
        ]
    return [item for item in items if item]


def _preferred(brief: JobPostingBrief, family: RoleFamily, organization: str) -> list[str]:
    items = [family.preferred]
    if len(brief.skills) > 5:
        items.append(f"Experience with {_join(brief.skills[5:8])}.")
    if brief.seniority in ENTRY_LEVELS:
        items.append("Personal, open-source or academic projects you can walk us through.")
    items.append(f"Interest in {organization}'s product and the problems it solves.")
    return items[:4]


def _level_title(brief: JobPostingBrief) -> str:
    """The title with its level, unless the title already says it: "entry-level ML Engineer"."""
    title = brief.title
    if brief.seniority == "Internship":
        return title if "intern" in title.lower() else f"{title} intern"
    prefix = LEVEL_PREFIXES.get(brief.seniority or "")
    if prefix and prefix.split("-")[0] not in title.lower():
        return f"{prefix} {title}"
    return title


def _arrangement(brief: JobPostingBrief) -> str:
    """The kind of role, as in "hybrid, full-time role", "remote internship" or "full-time role"."""
    words = [brief.work_arrangement.lower()] if brief.work_arrangement else []
    if brief.employment_type == "Internship":
        return " ".join([*words, "internship"])
    return ", ".join([*words, brief.employment_type.lower()]) + " role"


def _team(department: str) -> str:
    return department if department.lower().endswith("team") else f"{department} team"


def _article(phrase: str) -> str:
    """The article the phrase takes, by how it sounds: an ML Engineer, a UX Designer, an entry-level role."""
    word = phrase.split()[0] if phrase.split() else ""
    if word[:2].isupper():  # an abbreviation, said letter by letter
        return "an" if word[0] in "AEFHILMNORSX" else "a"
    return "an" if word[:1].lower() in "aeio" else "a"


def _as_sentence(text: str) -> str:
    text = " ".join(text.split())
    return text if text.endswith((".", "!", "?")) else f"{text}."


def _fit(sentences: list[str], limit: int) -> str:
    """The sentences, skipping blanks, up to the last one that fits in limit characters whole."""
    text = ""
    for sentence in filter(None, sentences):
        if len(text) + len(sentence) + 1 > limit:
            break
        text = f"{text} {sentence}".lstrip()
    return text


# Helpers


def _latest_completed(context: CandidateContext) -> InterviewFact | None:
    return context.completed_interviews[0] if context.completed_interviews else None


def _recent(context: CandidateContext, count: int) -> str:
    return " and ".join(f"{_lower_first(a.title)} {ago(a.at, context.now)}" for a in context.activities[:count])


def _next_step_line(context: CandidateContext) -> str:
    upcoming = context.upcoming_interview
    if upcoming:
        return f"{upcoming.title}, {when(upcoming.scheduled_at, context.now)} with {people(upcoming.interviewers)}."
    return "nothing scheduled yet."


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


def _join(items: list[str]) -> str:
    return people(items) if items else ""
