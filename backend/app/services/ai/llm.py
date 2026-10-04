"""Shared prompting for hosted models. Subclasses only make the HTTP call.

Every request asks for JSON and is validated against the same schemas the mock provider
returns (the analysis and job postings after a lenient read: _analysis, _job_posting);
anything unusable raises AIProviderError, and ai_service falls back to the mock.
"""

import re
from abc import abstractmethod
from typing import Annotated, Any, TypeVar

import httpx
from pydantic import BaseModel, BeforeValidator, ValidationError

from app.schemas.ai import AnalysisContent, AskContent, DraftContent, DraftPurpose, SkillEvidence
from app.schemas.demo import (
    MAX_ABOUT_ROLE,
    MAX_ABOUT_TEAM,
    MAX_ITEM,
    MAX_ITEMS,
    MAX_SKILL,
    MAX_SKILLS,
    MAX_SUMMARY,
    JobPostingBrief,
    JobPostingContent,
    clean_list,
)
from app.schemas.portal import AssistContent, PrepContent
from app.services.ai.client import AIProvider, AIProviderError
from app.services.ai.context import SECTIONS, CandidateContext
from app.services.ai.portal_context import PortalContext

Model = TypeVar("Model", bound=BaseModel)

SYSTEM_PROMPT = """You are the recruiting copilot in {organization}'s recruiter workspace, helping {recruiter} review one candidate.

Rules:
- Use only the context provided. If something isn't in it, say you don't know.
- You support the recruiter's judgement and never make hiring decisions. Never recommend rejecting, declining or disqualifying a candidate; suggest process steps (outreach, interviews, follow-ups, debriefs) instead.
- How often a candidate visits the portal or how fast they reply is not evidence of quality. Never cite it as a strength or a concern.
- Never speculate about age, gender, ethnicity, nationality, religion, disability, family status or other protected characteristics.
- Be concise and specific, and point to the evidence.
- Respond with a single JSON object only."""

ANALYZE_PROMPT = """Analyse this application for the recruiter.

{context}

Return a JSON object with exactly these keys, each of exactly this type:
- "summary": string, 2 to 3 sentences.
- "skills_matched": array of objects {{"skill": string, "evidence": string}}, one for each job requirement the context shows, "evidence" saying where. [] if none.
- "missing_skills": array of strings: the job requirements with no evidence in the context. [] if none.
- "strengths": array of short strings, each grounded in the context. [] if none.
- "concerns": array of short factual strings: gaps, risks or open questions. No hiring decisions. [] if none.
- "suggested_questions": array of 3 to 5 strings: interview questions that would close the gaps.
- "recommended_next_step": string, one sentence naming a process step for the recruiter.
Only "skills_matched" holds objects: every other array holds plain strings. Never use null."""

ASK_PROMPT = """{context}

Recruiter's question: {question}

Answer from the context, in short paragraphs or "-" bullet lists, with **bold** for key facts. If they ask for a message, write a draft for them to edit; never say it was sent.
Return a JSON object: {{"answer": string, "sources": array of the context sections you relied on, from "profile", "job", "activity", "interviews", "messages"}}."""

DRAFT_PROMPT = """{context}

Write a {purpose} message from {recruiter} to {first_name}.{instructions}
Keep it warm, specific to the context and under 150 words. Start the body with "Hi {first_name}," and end it with "Best,\\n{recruiter_first_name}".
Return a JSON object: {{"subject": string, "body": string}}."""

# The candidate assistant has its own prompts. Its context is the candidate's own record
# (PortalContext), so even a model that ignored these rules has no internal data to reveal.
CANDIDATE_SYSTEM_PROMPT = """You are the candidate assistant in {company}'s candidate portal, helping {first_name} with their application for the {role} role.

Rules:
- Use only the context provided: it is {first_name}'s own application record. If something isn't in it, say you don't know and suggest asking their recruiter.
- You can't see interviewer feedback, evaluations, scores, rankings, other candidates, internal concerns or hiring decisions. Never guess at them or at the chances of an offer; if asked, say so kindly and point {first_name} to their recruiter.
- Share company information only from the [company] section.
- Never promise outcomes or timelines.
- Be warm, encouraging, concise and practical.
- Respond with a single JSON object only."""

CANDIDATE_ASK_PROMPT = """{context}

{first_name}'s question: {question}

Answer in short paragraphs or "-" bullet lists, with **bold** for key facts.
Return a JSON object: {{"answer": string}}."""

CANDIDATE_PREP_PROMPT = """{context}

Prepare {first_name} for {interview}.
Return a JSON object with exactly these keys:
- "interview_format": one sentence describing the format.
- "what_to_expect", "role_focus", "topics_to_review", "questions_to_ask", "practice_questions": arrays of 3 to 5 short strings, grounded in the context.
- "company_info": array of strings taken only from the [company] section."""

# The AI job writer drafts the postings of demo jobs (services/demo_jobs.py). A recruiter reviews and
# edits every draft before publishing it, and services/ai/job_posting_policy.py leaves out anything
# that slips past these rules.
JOB_WRITER_SYSTEM_PROMPT = """You write job postings for {organization}'s careers site. A recruiter reviews, edits and publishes each posting, so what you write is a draft.

Rules:
- Use only the brief and the company overview provided. Never invent salary, benefits, visa or sponsorship details, office perks, team size, customers or company facts, including claims such as "fast-growing" or "cutting-edge".
- Requirements are job-related skills, knowledge and experience only. If you mention years of experience, give a minimum, never a maximum or a range. If you mention a degree, add "or equivalent practical experience".
- Never mention or imply age (no "young", "digital native", "recent graduate" or maximum years of experience), gender (no gendered words or pronouns: address the reader as "you"), race, ethnicity, national origin, citizenship or immigration status, religion, disability or health, pregnancy, marital or family status, sexual orientation or any other protected characteristic.
- No "native speaker", no "culture fit", and no physical requirements the job doesn't need.
- Use inclusive, plain language.
- Don't write screening questions, knockout criteria, or scoring or ranking rules.
- Respond with a single JSON object only."""

JOB_WRITER_PROMPT = """[brief]
Job title: {title}
Seniority: {seniority}
Department: {department}
Location: {location}
Work arrangement: {work_arrangement}
Employment type: {employment_type}
Skills: {skills}
Recruiter's notes: {notes}

[company overview]
{overview}

Write the job posting for this role. Return a JSON object with exactly these keys:
- "summary": 1 to 2 sentences.
- "about_role": one paragraph of 2 to 4 sentences.
- "responsibilities": array of 4 to 6 short strings.
- "requirements": array of 4 to 6 short strings, matched to the seniority and the skills.
- "preferred_qualifications": array of 2 to 4 short strings.
- "skills": array of 3 to 8 short skill names, including the recruiter's.
- "about_team": 1 to 3 sentences about the team and the company, using only the company overview, or "" if it says nothing relevant."""

NOT_GIVEN = "not given"

PURPOSES = {
    DraftPurpose.FOLLOW_UP: "follow-up",
    DraftPurpose.OUTREACH: "first outreach",
    DraftPurpose.INTERVIEW_CONFIRMATION: "interview confirmation",
    DraftPurpose.STATUS_UPDATE: "status update",
    DraftPurpose.OFFER_CHECK_IN: "offer check-in",
}

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")
_BULLET = re.compile(r"^(?:[-*•–]|\d+[.)])\s+")
# Some models hyphenate with U+2010 or the non-breaking U+2011; the recruiter edits a plain "-".
_HYPHENS = str.maketrans({"\u2010": "-", "\u2011": "-"})


class _AskJSON(BaseModel):
    answer: str
    sources: list[str] = []


def _or_empty(value: Any) -> Any:
    return "" if value is None else value


def _as_list(value: Any) -> Any:
    """A list the model wrote as one string, one item per line, or as a single object."""
    if value is None:
        return []
    if isinstance(value, str):
        return value.splitlines()
    return [value] if isinstance(value, dict) else value


_Text = Annotated[str, BeforeValidator(_or_empty)]
_List = Annotated[list[str], BeforeValidator(_as_list)]
_Items = Annotated[list[Any], BeforeValidator(_as_list)]

# A list item the model wrote as an object has its text under one of these keys.
_ITEM_KEYS = ("skill", "name", "requirement", "text", "question")


class _AnalysisJSON(BaseModel):
    """The analysis, read leniently. Given a near-empty profile (a demo careers applicant's), models sometimes
    write list items as objects, null evidence or a null list; _analysis makes that fit AnalysisContent instead
    of the whole analysis dropping to the mock."""

    summary: _Text = ""
    skills_matched: _Items = []
    missing_skills: _Items = []
    strengths: _Items = []
    concerns: _Items = []
    suggested_questions: _Items = []
    recommended_next_step: _Text = ""


class _JobPostingJSON(BaseModel):
    """The job writer's answer, read leniently. Lengths and tidiness are fixed afterwards (_job_posting),
    so a long but fine answer is trimmed to fit instead of failing validation and dropping to the mock."""

    summary: _Text = ""
    about_role: _Text = ""
    responsibilities: _List = []
    requirements: _List = []
    preferred_qualifications: _List = []
    skills: _List = []
    about_team: _Text = ""


class LLMProvider(AIProvider):
    temperature = 0.3

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self._transport = transport  # injected by tests

    @abstractmethod
    async def _generate(self, system: str, prompt: str) -> str:
        """Send one system + user turn and return the model's text."""

    async def analyze_candidate(self, context: CandidateContext) -> AnalysisContent:
        text = await self._generate(_system(context), ANALYZE_PROMPT.format(context=context.to_prompt()))
        content = _analysis(self._parse(text, _AnalysisJSON))
        if not (content.summary and content.recommended_next_step):
            raise AIProviderError(f"{self.name} returned an incomplete analysis")
        return content

    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        prompt = ASK_PROMPT.format(context=context.to_prompt(), question=question)
        result = self._parse(await self._generate(_system(context), prompt), _AskJSON)
        sections = [section for section in result.sources if section in SECTIONS] or ["profile"]
        return AskContent(answer=result.answer, sources=context.sources(*sections))

    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        prompt = DRAFT_PROMPT.format(
            context=context.to_prompt(),
            purpose=PURPOSES[purpose],
            recruiter=context.recruiter_name,
            recruiter_first_name=context.recruiter_first_name,
            first_name=context.first_name,
            instructions=f" Recruiter's instructions: {instructions}" if instructions else "",
        )
        return self._parse(await self._generate(_system(context), prompt), DraftContent)

    async def assist_candidate(self, context: PortalContext, question: str) -> AssistContent:
        prompt = CANDIDATE_ASK_PROMPT.format(
            context=context.to_prompt(), first_name=context.first_name, question=question
        )
        return self._parse(await self._generate(_candidate_system(context), prompt), AssistContent)

    async def prepare_candidate(self, context: PortalContext) -> PrepContent:
        interview = context.next_interview
        prompt = CANDIDATE_PREP_PROMPT.format(
            context=context.to_prompt(),
            first_name=context.first_name,
            interview=f"the {interview.title}" if interview else "their next interview (none is scheduled yet)",
        )
        return self._parse(await self._generate(_candidate_system(context), prompt), PrepContent)

    async def write_job_posting(self, brief: JobPostingBrief, organization: str, overview: str) -> JobPostingContent:
        prompt = JOB_WRITER_PROMPT.format(
            title=brief.title,
            seniority=brief.seniority or NOT_GIVEN,
            department=brief.department or NOT_GIVEN,
            location=brief.location or NOT_GIVEN,
            work_arrangement=brief.work_arrangement or NOT_GIVEN,
            employment_type=brief.employment_type,
            skills=", ".join(brief.skills) or NOT_GIVEN,
            notes=brief.notes or NOT_GIVEN,
            overview=overview or NOT_GIVEN,
        )
        system = JOB_WRITER_SYSTEM_PROMPT.format(organization=organization)
        content = _job_posting(self._parse(await self._generate(system, prompt), _JobPostingJSON), brief)
        if not (content.summary and content.about_role and content.responsibilities and content.requirements):
            raise AIProviderError(f"{self.name} returned an incomplete job posting")
        return content

    async def _post(self, url: str, *, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
                response = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise AIProviderError(f"{self.name} request failed ({exc.__class__.__name__})") from exc
        if response.status_code >= 400:
            raise AIProviderError(f"{self.name} returned HTTP {response.status_code}")
        try:
            return response.json()
        except ValueError as exc:
            raise AIProviderError(f"{self.name} returned a non-JSON response") from exc

    def _parse(self, text: str, model: type[Model]) -> Model:
        try:
            return model.model_validate_json(_FENCE.sub("", text.strip()))
        except ValidationError as exc:
            raise AIProviderError(f"{self.name} returned an unexpected response shape") from exc


def _system(context: CandidateContext) -> str:
    return SYSTEM_PROMPT.format(organization=context.organization, recruiter=context.recruiter_name)


def _candidate_system(context: PortalContext) -> str:
    return CANDIDATE_SYSTEM_PROMPT.format(
        company=context.company, first_name=context.first_name, role=context.job_title
    )


def _analysis(answer: _AnalysisJSON) -> AnalysisContent:
    """The answer made to fit AnalysisContent: items written as objects read by their text, null evidence made "",
    blanks and repeats dropped. A requirement is matched or missing, not both: the recruiter sees them in one list."""
    matched = _matched(answer.skills_matched)
    matched_skills = {item.skill.lower() for item in matched}
    return AnalysisContent(
        summary=answer.summary,
        skills_matched=matched,
        missing_skills=[skill for skill in _texts(answer.missing_skills) if skill.lower() not in matched_skills],
        strengths=_texts(answer.strengths),
        concerns=_texts(answer.concerns),
        suggested_questions=_texts(answer.suggested_questions),
        recommended_next_step=answer.recommended_next_step,
    )


def _matched(items: list[Any]) -> list[SkillEvidence]:
    matched: dict[str, SkillEvidence] = {}
    for item in items:
        skill = " ".join(_item_text(item).split())
        evidence = item.get("evidence") if isinstance(item, dict) else None
        if skill and skill.lower() not in matched:
            matched[skill.lower()] = SkillEvidence(skill=skill, evidence=evidence if isinstance(evidence, str) else "")
    return list(matched.values())


def _texts(items: list[Any]) -> list[str]:
    return clean_list([_item_text(item) for item in items])


def _item_text(item: Any) -> str:
    """A list item's text: the item itself, or for an object its first text under _ITEM_KEYS. Anything else is blank."""
    if isinstance(item, dict):
        texts = (item.get(key) for key in _ITEM_KEYS)
        item = next((text for text in texts if isinstance(text, str) and text.strip()), "")
    return item if isinstance(item, str) else ""


def _job_posting(answer: _JobPostingJSON, brief: JobPostingBrief) -> JobPostingContent:
    """The answer made to fit JobPostingContent: whitespace collapsed, bullets, blanks and repeats dropped,
    lists capped and long text cut at a word boundary. The recruiter's own skills come first."""
    skills = clean_list([*brief.skills, *(_unbullet(skill) for skill in answer.skills)])
    return JobPostingContent(
        summary=_clip(answer.summary, MAX_SUMMARY),
        about_role=_clip(answer.about_role, MAX_ABOUT_ROLE),
        responsibilities=_items(answer.responsibilities),
        requirements=_items(answer.requirements),
        preferred_qualifications=_items(answer.preferred_qualifications),
        # A "skill" too long for a chip is a sentence, not a skill name.
        skills=[skill for skill in skills if len(skill) <= MAX_SKILL][:MAX_SKILLS],
        about_team=_clip(answer.about_team, MAX_ABOUT_TEAM) or None,
    )


def _items(items: list[str]) -> list[str]:
    return clean_list([_clip(_unbullet(item), MAX_ITEM) for item in items])[:MAX_ITEMS]


def _unbullet(text: str) -> str:
    return _BULLET.sub("", text.strip()).translate(_HYPHENS)


def _clip(text: str, limit: int) -> str:
    """Whitespace collapsed, then cut at a word boundary if it's longer than limit, with an ellipsis
    unless the cut ends a sentence."""
    text = " ".join(text.translate(_HYPHENS).split())
    if len(text) <= limit:
        return text
    head = text[:limit]
    head = (head.rsplit(" ", 1)[0] if " " in head else head[: limit - 1]).rstrip(" ,;:-")
    return head if head.endswith((".", "!", "?")) else f"{head}…"
