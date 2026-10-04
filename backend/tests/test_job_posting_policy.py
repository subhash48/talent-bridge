"""The job posting policy (services/ai/job_posting_policy.py): what an AI-drafted posting may never say,
and the ordinary engineering text it must leave alone."""

import logging

import pytest

from app.schemas.demo import JobPostingContent
from app.services.ai.job_posting_policy import apply_policy, mentions_protected

PROTECTED = [
    # age
    "Must be under 30 years old.",
    "Join our young team.",
    "A youthful, energetic environment.",
    "Digital natives welcome.",
    "Perfect for a recent graduate.",
    "Ideal for recent grads.",
    "Ideal for recent college graduates.",
    "Open to recent university graduates.",
    "We're looking for new grads with fresh ideas.",
    "A role for a new graduate.",
    "Millennials thrive here.",
    "Gen Z energy.",
    "Applicants aged 21 to 30.",
    "Must be over the age of 21.",
    "No more than 5 years of experience.",
    "At most 3 years of experience.",
    "A maximum of 4 years in industry.",
    "Up to 3 years of experience in backend development.",
    "Less than 5 years of professional experience.",
    "Fewer than 4 years in industry.",
    "Under 2 years of experience.",
    "Between 2 and 4 years of experience with Python.",
    "0-2 years of experience with Python.",
    "2–4 years’ experience.",
    "3 to 5 years of professional experience.",
    # gender
    "He will lead the platform team.",
    "She owns the roadmap.",
    "Support his or her teammates.",
    "Ask him anything.",
    "The choice is hers.",
    "Prove himself quickly.",
    "Male candidates preferred.",
    "Great for women in tech.",
    "A man for the job.",
    "Extra manpower for launches.",
    "You guys will love it.",
    "Ladies and gentlemen.",
    # race, ethnicity, national origin, citizenship
    "Regardless of race.",
    "A racially diverse team.",
    "Ethnicity data.",
    "Any nationality.",
    "National origin.",
    "Native English speaker.",
    "Native speakers only.",
    "Native-level English.",
    "Native‑level Japanese.",
    "English as your mother tongue.",
    "US citizens only.",
    "Citizenship required.",
    "Immigrants welcome.",
    "Immigration paperwork.",
    "Visa status must be settled.",
    # religion
    "Religious holidays off.",
    "A Christian company.",
    "Muslim prayer room.",
    "Jewish holidays.",
    "Hindu festival.",
    "Buddhist retreat.",
    "Near the church.",
    # disability, health, pregnancy
    "Not suitable for disabled people.",
    "Disabled applicants need not apply.",
    "Disability support.",
    "Must be able-bodied.",
    "Must be able\u2011bodied.",
    "Handicapped access.",
    "Must be physically fit.",
    "In good health.",
    "Not pregnant.",
    "Pregnancy cover.",
    "Maternity leave.",
    # marital and family status
    "Married applicants.",
    "Marital status.",
    "Childless preferred.",
    "No children, so you can travel.",
    "Family status.",
    # sexual orientation
    "Sexual orientation.",
    "Gay-friendly.",
    "Lesbian network.",
    # sameness instead of the job
    "Must be a culture fit.",
    "A strong cultural fit.",
]

ENGINEERING = [
    "Treat the model as a black-box and probe its failure modes.",
    "Whiteboard system designs with the team.",
    "Keep a single source of truth for labels.",
    "Work in a mature codebase.",
    "Report to the engineering manager.",
    "Experience with project management.",
    "Debug race conditions in concurrent code.",
    "Find data races with sanitizers.",
    "Write race-free concurrent Go code and use the race detector in CI.",
    "Help us build the data tooling for the age of AI.",
    "Build accessible interfaces that work for people with disabilities, following WCAG 2.2.",
    "Champion accessibility so the product works for everyone, including users with disabilities.",
    "Support customers with disabilities through screen readers and keyboard navigation.",
    "Keep every flow accessible to disabled users.",
    "Clean up disabled feature flags and dead code paths.",
    "Show a disabled button state while saving.",
    "Audit disabled accounts, settings and form fields.",
    "Work with our citizen developers and analysts.",
    "Read the man pages.",
    "Prevent man-in-the-middle attacks.",
    "Build cloud-native services and native mobile apps.",
    "Design storage, image and message pipelines.",
    "Usage-based pricing and language models.",
    "Work with the other teams on their roadmaps.",
    "Human-in-the-loop labelling.",
    "3+ years of experience with Python.",
    "At least 2 years of experience shipping software.",
    "No less than 2 years of experience with SQL.",
    "Mentor junior engineers and senior staff.",
    "Shepherd releases through staging.",
]


@pytest.mark.parametrize("text", PROTECTED)
def test_protected_characteristics_are_flagged(text: str) -> None:
    assert mentions_protected(text)


@pytest.mark.parametrize("text", ENGINEERING)
def test_ordinary_engineering_text_passes(text: str) -> None:
    assert not mentions_protected(text)


def test_apply_policy_leaves_out_flagged_sentences_and_items(caplog: pytest.LogCaptureFixture) -> None:
    content = JobPostingContent(
        summary="Build data tooling. Perfect for a recent graduate. Ship it to customers.",
        about_role="You'll own the pipeline.",
        responsibilities=["Own the pipeline.", "He will report to the CTO."],
        requirements=["Python.", "Native English speaker."],
        preferred_qualifications=["Must be a culture fit."],
        skills=["Python", "Native English"],
        about_team="Join a young team.",
    )
    with caplog.at_level(logging.INFO):
        cleaned, removed = apply_policy(content)
    assert removed == 5
    assert cleaned.summary == "Build data tooling. Ship it to customers."
    assert cleaned.about_role == "You'll own the pipeline."
    assert cleaned.responsibilities == ["Own the pipeline."]
    assert cleaned.requirements == ["Python."]
    assert cleaned.preferred_qualifications == []
    assert cleaned.skills == ["Python", "Native English"]  # a language is a skill; "speaker" is the problem
    assert cleaned.about_team is None
    # The count is logged, never the text.
    assert "5 line(s)" in caplog.text and "graduate" not in caplog.text and "young" not in caplog.text


def test_apply_policy_changes_nothing_when_nothing_is_flagged() -> None:
    content = JobPostingContent(
        summary="Build data tooling.  Ship it to customers.",
        responsibilities=["Debug race conditions."],
        about_team="You'll join the Engineering team.",
    )
    cleaned, removed = apply_policy(content)
    assert removed == 0
    assert cleaned == content
