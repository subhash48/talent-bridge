"""Mock provider: deterministic, offline answers composed from the candidate context.

Used when no AI key is configured, in the tests, and as the automatic fallback when Gemini or
Groq fails, so the recruiter always gets a grounded answer. It never recommends rejecting anyone.
"""

import re

from app.core.enums import CANDIDATE_ACTIONS, ActivityType, ApplicationStage, SenderType
from app.schemas.ai import (
    AnalysisContent,
    AskContent,
    DraftContent,
    DraftPurpose,
    SkillEvidence,
)
from app.schemas.event import EngagementLevel
from app.services.ai.client import AIProvider
from app.services.ai.context import (
    ENGAGEMENT_DESCRIPTIONS,
    ENGAGEMENT_LABELS,
    CandidateContext,
    InterviewFact,
    ago,
    people,
    when,
)

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
        return _draft(context, purpose)


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
    level = context.engagement_level
    parts.append(f"Engagement is {ENGAGEMENT_LABELS[level].lower()}: {ENGAGEMENT_DESCRIPTIONS[level]}.")
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
    actions = _recent_candidate_actions(context)
    if context.engagement_level == EngagementLevel.HIGH and actions:
        items.append(f"Responsive: {_join([a.lower() for a in actions[:3]])} in the last few days.")
    elif context.engagement_level == EngagementLevel.MEDIUM and actions:
        items.append(f"Engaged this week: {actions[0].lower()}.")
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
    if context.engagement_level == EngagementLevel.LOW:
        items.append("Engagement has dropped: no candidate activity for over a week.")
    elif context.engagement_level == EngagementLevel.INSUFFICIENT:
        items.append("No candidate activity yet, so there's little signal on interest.")
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
    level = context.engagement_level
    where = f" based in {context.location}" if context.location else ""
    lines = [
        f"**{context.name}** is a {context.job_title} candidate{where}, currently in the **{context.stage.label}** stage.",
        "",
        f"- **Engagement: {ENGAGEMENT_LABELS[level]}.** {ENGAGEMENT_DESCRIPTIONS[level].capitalize()}"
        + (f"; most recently {_recent(context, 2)}." if context.activities else "."),
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
        lines.append(f"I'd follow up today so {context.first_name} doesn't go cold.")
    elif level == EngagementLevel.HIGH:
        lines.append("A responsive candidate moving on schedule. No follow-up needed right now.")
    elif level == EngagementLevel.INSUFFICIENT:
        lines.append("There isn't much signal yet. A personal outreach message is the best next move.")
    else:
        lines.append(f"Momentum is steady. A quick check-in would keep {context.first_name} engaged.")
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
                else "**Book a hiring-manager screen** while engagement is fresh."
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
    level = context.engagement_level
    latest = context.activities[0] if context.activities else None
    lines = [
        f"Here's the latest on **{context.name}** ({context.job_title}, {context.stage.label}):",
        "",
        f"- **Last activity:** {latest.title}, {ago(latest.at, context.now)}."
        if latest
        else "- **Last activity:** none yet.",
        f"- **Engagement:** {ENGAGEMENT_LABELS[level]}. {ENGAGEMENT_DESCRIPTIONS[level].capitalize()}.",
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


# Helpers


def _latest_completed(context: CandidateContext) -> InterviewFact | None:
    return context.completed_interviews[0] if context.completed_interviews else None


def _recent_candidate_actions(context: CandidateContext) -> list[str]:
    return [a.title for a in context.activities if a.type in CANDIDATE_ACTIONS and (context.now - a.at).days < 3]


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
