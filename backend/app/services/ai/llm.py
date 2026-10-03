"""Shared prompting for hosted models. Subclasses only make the HTTP call.

Every request asks for JSON and is validated against the same schemas the mock provider
returns; anything malformed raises AIProviderError, and ai_service falls back to the mock.
"""

import re
from abc import abstractmethod
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.schemas.ai import AnalysisContent, AskContent, DraftContent, DraftPurpose
from app.schemas.portal import AssistContent, PrepContent
from app.services.ai.client import AIProvider, AIProviderError
from app.services.ai.context import SECTIONS, CandidateContext
from app.services.ai.portal_context import PortalContext

Model = TypeVar("Model", bound=BaseModel)

SYSTEM_PROMPT = """You are the recruiting copilot in {organization}'s recruiter workspace, helping {recruiter} review one candidate.

Rules:
- Use only the context provided. If something isn't in it, say you don't know.
- You support the recruiter's judgement and never make hiring decisions. Never recommend rejecting, declining or disqualifying a candidate; suggest process steps (outreach, interviews, follow-ups, debriefs) instead.
- Engagement measures responsiveness to our process, not candidate quality.
- Never speculate about age, gender, ethnicity, nationality, religion, disability, family status or other protected characteristics.
- Be concise and specific, and point to the evidence.
- Respond with a single JSON object only."""

ANALYZE_PROMPT = """Analyse this application for the recruiter.

{context}

Return a JSON object with exactly these keys:
- "summary": 2 to 3 sentences.
- "skills_matched": array of {{"skill": a job requirement, "evidence": where the context shows it}}.
- "missing_skills": array of job requirements with no evidence in the context.
- "strengths": array of short strings, each grounded in the context.
- "concerns": array of short factual strings: gaps, risks or open questions. No hiring decisions.
- "suggested_questions": 3 to 5 interview questions that would close the gaps.
- "recommended_next_step": one sentence naming a process step for the recruiter."""

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

PURPOSES = {
    DraftPurpose.FOLLOW_UP: "follow-up",
    DraftPurpose.OUTREACH: "first outreach",
    DraftPurpose.INTERVIEW_CONFIRMATION: "interview confirmation",
    DraftPurpose.STATUS_UPDATE: "status update",
    DraftPurpose.OFFER_CHECK_IN: "offer check-in",
}

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class _AskJSON(BaseModel):
    answer: str
    sources: list[str] = []


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
        return self._parse(text, AnalysisContent)

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
