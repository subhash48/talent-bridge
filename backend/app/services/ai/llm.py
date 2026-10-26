"""Shared prompting for hosted models. Subclasses only make the HTTP call.

Every request asks for JSON and is validated against the same schemas the mock provider
returns (job postings after a lenient read: _job_posting);
anything unusable raises AIProviderError, and ai_service falls back to the mock.
"""

import re
from abc import abstractmethod
from typing import Annotated, Any, TypeVar

import httpx
from pydantic import BaseModel, BeforeValidator, ValidationError

from app.schemas.ai import AskContent, DraftContent, DraftPurpose
from app.schemas.assistant import AssistantIntent
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

SYSTEM_PROMPT = """You are the recruiting copilot in {organization}'s recruiter workspace, helping {recruiter} keep one candidate informed.

Rules:
- Use only the context provided. If something isn't in it, say you don't know.
- You help with communication: where the candidate stands, what they're waiting for, and messages to them. Never evaluate, score, rank or compare candidates, list their strengths, weaknesses or concerns, or say whether to hire, advance or reject anyone. If asked, say that hiring decisions stay with the team and offer the candidate's status or a message instead.
- How often a candidate visits the portal or how fast they reply is not evidence of quality. Never cite it as a strength or a concern.
- Never speculate about age, gender, ethnicity, nationality, religion, disability, family status or other protected characteristics.
- Be concise and specific, and point to the evidence.
- Respond with a single JSON object only."""

ASK_PROMPT = """{context}

Recruiter's question: {question}

Answer from the context, in short paragraphs or "-" bullet lists, with **bold** for key facts. If they ask for a message, write a draft for them to edit; never say it was sent.
Return a JSON object: {{"answer": string, "sources": array of the context sections you relied on, from "profile", "job", "activity", "interviews", "messages"}}."""

DRAFT_PROMPT = """{context}

Write a {purpose} message from {recruiter} to {first_name}.{instructions}
{replies}
{first_name} will read it: never mention interview feedback, internal notes, scores, rankings, other candidates or the reasons for a decision, and never promise an outcome or invent a date.
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
- "company_info": array of strings taken only from the [company] section.
- "resume_talking_points": 2 to 4 experiences from the [your résumé] section worth having a story ready about, each naming the experience and what to bring out; an empty array if there is no résumé."""

CANDIDATE_MOCK_PROMPT = """{context}

{first_name} is practising for an interview for the {role} role.
Practice question: {question}
{first_name}'s answer: {answer}

Coach them on this answer in 2 to 4 short "-" bullet points: what works, and what would make it stronger (a specific example, the outcome, what they did themselves, a link to the role). Be encouraging and practical. Never give a score or a grade, and never guess what the interviewers will think or whether they will get the job.
Return a JSON object: {{"answer": string}}."""

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

# The recruiter assistant: a request (typed, or transcribed speech) as one structured action
# (schemas/assistant.AssistantIntent). The model only reads the request; the engine resolves, checks,
# asks for confirmation and carries it out.
ASSISTANT_SYSTEM_PROMPT = """You turn a request in an employer's hiring workspace into one structured action. The employer is a recruiting team, or a small business owner using Simple Hire who says things plainly ("I need two workers for my restaurant", "give me their phone numbers"). The workspace keeps candidates informed: who needs an update, what they're waiting for, and messages to them; it finds candidates on job-related criteria the recruiter chooses, drafts personal outreach and interview invitations to the candidates the recruiter picked, and drafts new jobs. You never carry anything out and never answer the request yourself.

Rules:
- Pick exactly one action. Copy names, job titles, skills and details as the recruiter said them; never invent a candidate, job, skill, number or date.
- "draft", "write", "prepare" or "preview" means mode "draft"; "send", "email", "ask", "invite" or "remind" means mode "execute".
- Searches use only job-related criteria: skills, requirements, the job, the stage, a location, interview progress, communication. Never put race, ethnicity, gender, age, nationality, religion, disability, sexual orientation or any other personal characteristic in a search, a message or a question about a candidate.
- Respond with a single JSON object only."""

ASSISTANT_PROMPT = """[conversation context]
{context}

[request]
{text}

Actions and their fields:
- who_needs_update: who is owed an update today ("who needs an update?", "who's waiting on us?").
- unanswered: candidates whose messages have no reply yet.
- unconfirmed_interviews: upcoming interviews the candidates haven't confirmed.
- no_follow_up: the question "who interviewed recently and hasn't heard from us since?". A request to show or filter a list ("show candidates who interviewed but haven't received an update") is search_candidates with interview_state awaiting_update.
- draft_message: a message to one candidate ("draft Sarah an update", "remind Priya about her interview"). candidate_name, instructions (what it should say), mode.
- send_interview_email: ask a candidate to schedule an interview. candidate_name, job_title (only if said), interview {{"interview_type", "duration_minutes", "timeframe"}}, mode.
- search_candidates: a list of candidates ("show applicants for the ML Engineer job", "filter for Python and AWS", "show 10 matching", "the top 10 for this role", "show me 3 applicants with kitchen experience available Friday and Saturday"). job_title ("that role" for the job in context), skills (array, as said, e.g. "Kitchen experience"), stage (sourced|screening|interview|offer|hired), location, interview_state (upcoming|interviewed|awaiting_update|none; "interviewed but haven't had an update" is awaiting_update), available_days (array of monday..sunday the applicants said they can work; "weekends" is saturday and sunday), limit (a number), refine (true when it narrows the list already shown).
- show_contacts: the contact details applicants gave when they applied ("give me their phone numbers", "what's Maria's number?"). candidate_names only if named; otherwise it's the candidates ticked.
- select_candidates: tick candidates in the list on screen ("select Sophia, Maya and James"). candidate_names (array), selection (replace|add|remove|clear).
- draft_outreach: one personal message or interview invitation for each of several candidates ("draft interview invitations for the selected candidates", "invite these five to a 30-minute first interview next Tuesday between 1 and 4 PM"). candidate_names only if named, instructions, interview {{"interview_type", "duration_minutes", "timeframe"}} for an invitation, schedule {{"interview_type", "duration_minutes", "timeframe", "window_start": "HH:MM", "window_end": "HH:MM"}} when a day or time is given.
- schedule_interviews: interview times for the outreach in context, or for the selected candidates ("make these 30-minute interviews next Tuesday afternoon"). schedule as above.
- create_job: draft a new job ("create a Senior Product Designer role in New York, hybrid, requiring Figma", "post a cashier job paying $16 an hour for weekend shifts", "I need two workers for my restaurant, evening shift"). job {{"title" (with any level, as said; never "workers" or "people"), "department", "location", "work_arrangement" (On-site|Hybrid|Remote), "employment_type" (Full-time|Part-time|Contract|Internship|Temporary), "seniority" (Internship|Entry Level|Mid Level|Senior|Staff|Principal|Manager|Director), "salary_min", "salary_max" (yearly, whole units, only if said), "pay" (an hourly or weekly rate as said, like "$18/hour"), "shift" (Evenings|Mornings|Afternoons|Overnight|Weekends, only if said), "work_days" (array of monday..sunday), "openings" (how many people, only if said), "skills_add" (array: skills and requirements as said, like "Kitchen experience"), "notes" (the request)}}.
- update_job: change the job draft in context ("add Kubernetes and model monitoring", "make it remote"). job with only what changes, and "skills_remove".
- candidate_info: a question about one candidate's application or communication. candidate_name.
- next_interview: one candidate's next interview, or whether it's confirmed. candidate_name.
- confirm: "yes", "looks good", "send it", "send them", "approve" about the pending proposal in the context, when the request is only that approval. mode "execute" only for an explicit approval ("approve", "create it", "yes, send them"), else "draft". A request that approves and also asks for a change ("okay, remove James first", "yes, but make it remote") is never confirm: it's the change (select_candidates with selection remove, update_job, schedule_interviews). "No", "not yet" or "don't …" is never confirm, and never the thing it says not to do.
- cancel: dismiss the pending proposal in the context ("cancel", "no, don't send them").
- help: anything else.

Return a JSON object with "action" and only the fields that apply, for example {{"action": "draft_message", "mode": "draft", "candidate_name": "Sarah", "instructions": "an update"}} or {{"action": "search_candidates", "job_title": "Product Designer", "skills": ["Figma", "Design systems"], "limit": 5}}."""

TRANSCRIPTION_PROMPT = (
    "A recruiter talking to a recruiting assistant about candidates, interviews and updates to send. {vocabulary}"
)

NOT_GIVEN = "not given"

PURPOSES = {
    DraftPurpose.FOLLOW_UP: "follow-up",
    DraftPurpose.OUTREACH: "first outreach",
    DraftPurpose.INTERVIEW_CONFIRMATION: "interview confirmation",
    DraftPurpose.STATUS_UPDATE: "status update",
    DraftPurpose.OFFER_CHECK_IN: "offer check-in",
    DraftPurpose.INTERVIEW_INVITATION: (
        "interview invitation that thanks them for their interest in the role, naming the role by its job title, "
        "and asks them to reply with a few times that work (never invent a date, time, meeting link or scheduling "
        "link the recruiter didn't give)"
    ),
    DraftPurpose.INTERVIEW_PROPOSAL: (
        "interview invitation for the time the recruiter proposed in their instructions: thank them for their interest "
        "in the role, naming it by its job title; give the interview, its length and the proposed time exactly as "
        "written; say they can confirm it under Interviews in their candidate portal, and to reply if the time "
        "doesn't suit them (never invent another time, a meeting link or a scheduling link)"
    ),
    DraftPurpose.CUSTOM: "short",
    DraftPurpose.STAGE_UPDATE: "status update telling them their application has moved to a new stage",
    DraftPurpose.QUESTION_REPLY: (
        "reply to the candidate's latest message, answering only from the context (if the answer isn't "
        "there, say you'll find out and come back to them)"
    ),
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

    async def ask_candidate(self, context: CandidateContext, question: str) -> AskContent:
        prompt = ASK_PROMPT.format(context=context.to_prompt(), question=question)
        result = self._parse(await self._generate(_system(context), prompt), _AskJSON)
        sections = [section for section in result.sources if section in SECTIONS] or ["profile"]
        return AskContent(answer=result.answer, sources=context.sources(*sections))

    async def draft_message(
        self, context: CandidateContext, purpose: DraftPurpose, instructions: str | None = None
    ) -> DraftContent:
        prompt = DRAFT_PROMPT.format(
            context=context.to_prompt(for_candidate=True),
            purpose=PURPOSES[purpose],
            recruiter=context.recruiter_name,
            recruiter_first_name=context.recruiter_first_name,
            first_name=context.first_name,
            instructions=f" Recruiter's instructions: {instructions}" if instructions else "",
            replies=f"{context.first_name} can reply to it in their candidate portal."
            if context.can_reply
            else f"{context.first_name} can't reply in their candidate portal yet: never ask them to reply or write "
            "back, and point them to their candidate portal for what's next.",
        )
        return self._parse(await self._generate(_system(context), prompt), DraftContent)

    async def assist_candidate(self, context: PortalContext, question: str) -> AssistContent:
        prompt = CANDIDATE_ASK_PROMPT.format(
            context=context.to_prompt(), first_name=context.first_name, question=question
        )
        return self._parse(await self._generate(_candidate_system(context), prompt), AssistContent)

    async def prepare_candidate(self, context: PortalContext) -> PrepContent:
        interview = context.focus_interview
        prompt = CANDIDATE_PREP_PROMPT.format(
            context=context.to_prompt(),
            first_name=context.first_name,
            interview=f"the {interview.title}" if interview else "their next interview (none is scheduled yet)",
        )
        return self._parse(await self._generate(_candidate_system(context), prompt), PrepContent)

    async def mock_interview_feedback(self, context: PortalContext, question: str, answer: str) -> AssistContent:
        prompt = CANDIDATE_MOCK_PROMPT.format(
            context=context.to_prompt(),
            first_name=context.first_name,
            role=context.job_title,
            question=question,
            answer=answer,
        )
        return self._parse(await self._generate(_candidate_system(context), prompt), AssistContent)

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

    async def understand_request(self, text: str, context: str) -> AssistantIntent:
        system = ASSISTANT_SYSTEM_PROMPT
        prompt = ASSISTANT_PROMPT.format(context=context or "nothing yet", text=text)
        return self._parse(await self._generate(system, prompt), AssistantIntent)

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
