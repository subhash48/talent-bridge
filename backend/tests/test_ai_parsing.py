"""The analysis a hosted model writes, read leniently (services/ai/llm.py).

A demo careers applicant has a near-empty profile, and Groq then sometimes writes list items as objects, null
evidence or a null list. Those answers are still the model's analysis: only an answer without its summary or
next step falls back to the mock. MISSING_AS_OBJECTS is a real answer, shortened.
"""

import json
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest

from app.core.enums import ActivityType, ApplicationStage
from app.models.base import utcnow
from app.services.ai.client import AIProviderError
from app.services.ai.context import ActivityFact, CandidateContext, parse_requirements
from app.services.ai.groq import GroqProvider
from app.services.ai_service import with_fallback

DESCRIPTION = "Build machine learning systems for product teams.\n\nSkills: Python, PyTorch, SQL"
NEXT_STEP = "Schedule an initial screening call to verify technical experience and fill the identified gaps."

# openai/gpt-oss-120b on Groq: missing_skills written like skills_matched, which failed the strict parse.
MISSING_AS_OBJECTS = {
    "summary": (
        "Priya Raman's profile provides no listed skills or experience, making it unclear whether they meet the "
        "core requirements for the entry‑level ML Engineer role."
    ),
    "skills_matched": [],
    "missing_skills": [
        {"skill": "Proficiency in Python programming", "evidence": "No evidence in profile"},
        {"skill": "Experience with PyTorch for building ML models", "evidence": "No evidence in profile"},
        {"skill": "Ability to write SQL queries for data extraction", "evidence": "No evidence in profile"},
    ],
    "strengths": [],
    "concerns": ["No skills or experience listed in profile", "No evidence of meeting any job requirements"],
    "suggested_questions": [
        "What experience do you have building or training models with PyTorch?",
        "How have you written and optimized SQL queries for data extraction?",
    ],
    "recommended_next_step": NEXT_STEP,
}
# The same answer with missing_skills as asked: what the strict parse accepted.
PLAIN = {**MISSING_AS_OBJECTS, "missing_skills": [item["skill"] for item in MISSING_AS_OBJECTS["missing_skills"]]}


def careers_applicant() -> CandidateContext:
    """What the background analysis knows right after a demo careers application: a name, the job, one activity."""
    now = utcnow()
    return CandidateContext(
        application_id=uuid.uuid4(),
        candidate_id=uuid.uuid4(),
        job_id=uuid.uuid4(),
        name="Priya Raman",
        first_name="Priya",
        pronouns=None,
        location=None,
        headline=None,
        skills=(),
        job_title="ML Engineer",
        job_department="Engineering",
        job_description=DESCRIPTION,
        job_requirements=parse_requirements(DESCRIPTION),
        stage=ApplicationStage.SCREENING,
        source="Ashby Simulator / Demo Careers",
        applied_at=now - timedelta(seconds=2),
        follow_up_reason=None,
        activities=(ActivityFact(ActivityType.APPLICATION_CREATED.value, "Application received", None, now),),
        interviews=(),
        messages=(),
        recruiter_name="the recruiting team",
        organization="Encord",
        now=now,
    )


def groq(answer: Any, seen: dict[str, Any] | None = None) -> GroqProvider:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen["body"] = json.loads(request.content)
        text = answer if isinstance(answer, str) else json.dumps(answer)
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    return GroqProvider(api_key="test-key", model="openai/gpt-oss-120b", transport=httpx.MockTransport(handler))


async def test_list_items_written_as_objects_are_read_by_their_text() -> None:
    seen: dict[str, Any] = {}
    provider = groq(MISSING_AS_OBJECTS, seen)
    content, model = await with_fallback(provider, lambda p: p.analyze_candidate(careers_applicant()))
    assert model == "openai/gpt-oss-120b"
    assert content.missing_skills == [
        "Proficiency in Python programming",
        "Experience with PyTorch for building ML models",
        "Ability to write SQL queries for data extraction",
    ]
    assert content.summary == MISSING_AS_OBJECTS["summary"]
    assert content.concerns == MISSING_AS_OBJECTS["concerns"]
    assert content.recommended_next_step == NEXT_STEP

    # The prompt spells out each key's type.
    prompt = seen["body"]["messages"][1]["content"]
    assert '"skills_matched": array of objects {"skill": string, "evidence": string}' in prompt
    assert '"missing_skills": array of strings' in prompt


async def test_null_evidence_missing_lists_blanks_and_repeats() -> None:
    answer = {
        "summary": "  Priya applied for the ML Engineer role.  ",
        "skills_matched": [
            {"skill": "Python", "evidence": None},
            {"requirement": "SQL"},
            "PyTorch",
            {"skill": "python", "evidence": "Listed twice."},
            {"evidence": "No skill named."},
        ],
        "missing_skills": [{"name": "APIs"}, {"text": "Git", "evidence": None}, "SQL", "", "  ", None, 3],
        "strengths": None,
        "suggested_questions": [
            {"question": "Which Python projects have you shipped?"},
            "Which  Python projects have you shipped?",
            {"question": None},
        ],
        "recommended_next_step": NEXT_STEP,
    }
    content = await groq(answer).analyze_candidate(careers_applicant())
    assert content.summary == "Priya applied for the ML Engineer role."
    assert [(item.skill, item.evidence) for item in content.skills_matched] == [
        ("Python", ""),
        ("SQL", ""),
        ("PyTorch", ""),
    ]
    assert content.missing_skills == ["APIs", "Git"]  # SQL is matched, so it isn't missing as well
    assert content.strengths == [] and content.concerns == []  # a null list, and one left out
    assert content.suggested_questions == ["Which Python projects have you shipped?"]


async def test_a_list_written_as_text_or_as_one_object() -> None:
    answer = {
        "summary": "Priya applied for the ML Engineer role.",
        "skills_matched": {"skill": "Python", "evidence": "Named in the application."},
        "concerns": "No skills listed on the profile.\nNo headline.",
        "recommended_next_step": NEXT_STEP,
    }
    content = await groq(answer).analyze_candidate(careers_applicant())
    assert [(item.skill, item.evidence) for item in content.skills_matched] == [("Python", "Named in the application.")]
    assert content.concerns == ["No skills listed on the profile.", "No headline."]


@pytest.mark.parametrize(
    "answer",
    [
        {**PLAIN, "summary": None},
        {**PLAIN, "summary": "   "},
        {key: value for key, value in PLAIN.items() if key != "recommended_next_step"},
        {**PLAIN, "recommended_next_step": ""},
        {**PLAIN, "summary": ["Two", "sentences."]},
        {"analysis": PLAIN},
        [PLAIN],
        "Here is the analysis you asked for.",
    ],
)
async def test_an_analysis_without_its_essentials_falls_back_to_the_mock(answer: Any) -> None:
    provider = groq(answer)
    with pytest.raises(AIProviderError):
        await provider.analyze_candidate(careers_applicant())

    content, model = await with_fallback(provider, lambda p: p.analyze_candidate(careers_applicant()))
    assert model == "mock (fallback from groq)"
    assert content.summary and content.recommended_next_step
