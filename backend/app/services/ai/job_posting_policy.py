"""The job posting policy: what an AI-drafted job posting may never say.

The AI job writer's prompt (services/ai/llm.py) gives the same rules; this check runs on whatever comes
back, from a hosted model or the mock. Every list item, and every sentence of the summary, about the
role and about the team, that mentions or implies a protected characteristic is left out, and the
recruiter is told how many were (GeneratedJobPosting.removed). Only that count is logged, never the text.

The patterns are whole words, chosen to leave ordinary engineering text alone: "race condition",
"black-box", "whiteboard", "single source of truth", "mature codebase" and "manager" all pass, and so
do "the age of AI", "citizen developers", "disabled feature flags" and accessibility work for "people
with disabilities".
"""

import logging
import re
from typing import Any

from app.schemas.demo import JobPostingContent

logger = logging.getLogger(__name__)

PROTECTED = re.compile(
    r"\b(?:"
    # Age, and the usual stand-ins for it, including a cap on experience ("no less than" is a minimum).
    # "The age of AI" is an era; "the age of 21" is an age.
    r"(?<!the\s)age|age(?!\s+of\b(?!\s+\d+\b))|aged|years?\s+old|young|youthful|digital\s+natives?"
    r"|recent\s+(?:(?:college|university)\s+)?grad(?:uate)?s?|new\s+grad(?:uate)?s?|millennials?|gen[\s-]?z"
    r"|(?:no|not)\s+more\s+than\s+\d+\s+years?|at\s+most\s+\d+\s+years?|maximum\s+of\s+\d+\s+years?"
    r"|(?:up\s+to|(?<!no\s)(?<!not\s)(?:less|fewer)\s+than|under)\s+\d+\s+years?|between\s+\d+\s+and\s+\d+\s+years?"
    r"|\d+\s*(?:-|–|to)\s*\d+\+?\s+years?(?:['’]|\s+of)?(?:\s+[\w-]+){0,2}\s+experience"
    # Gender, including gendered pronouns: a posting addresses the reader as "you".
    r"|male|female|men|women|man(?![\s-](?:in[\s-]the[\s-]middle|pages?)\b)|woman|gentlem[ae]n|lady|ladies|guys"
    r"|he|she|him|his|her|hers|himself|herself|manpower"
    # Race, ethnicity, national origin, citizenship and immigration status. Not concurrency ("race-free code",
    # "the race detector") or "citizen developers".
    r"|(?<!data\s)race(?![\s-](?:conditions?|free|detectors?)\b)|racial(?:ly)?|ethnic(?:ity|ally)?|nationality"
    r"|national\s+origin|native\s+(?:english\s+)?speakers?|native[\s-]level|mother[\s-]tongues?"
    r"|citizen(?![\s-]developers?\b)(?:ship|s)?|immigra(?:nts?|tion)|visa\s+status"
    # Religion.
    r"|religio(?:n|ns|us)|christians?|muslims?|jewish|hindus?|buddhists?|church(?:es)?"
    # Disability, health and pregnancy. Not accessibility work ("people with disabilities", "accessible to
    # disabled users") or a disabled feature flag, button or account.
    r"|(?<!people\swith\s)(?<!users\swith\s)(?<!customers\swith\s)(?<!accessible\sto\s)"
    r"disab(?:ility|ilities|led(?![\s-](?:features?|flags?|buttons?|states?|settings?|accounts?|fields?)\b))"
    r"|able[\s-]bodied|handicap(?:ped)?|physically\s+fit|good\s+health|pregnan(?:t|cy)|maternity"
    # Marital and family status.
    r"|married|marital|childless|no\s+children|family\s+status"
    # Sexual orientation.
    r"|sexual\s+orientation|gay|lesbian"
    # Fit judged by sameness rather than by the job.
    r"|cultur(?:e|al)[\s-]fit"
    r")\b",
    re.IGNORECASE,
)

_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
# Some models hyphenate with U+2010 or the non-breaking U+2011: "able-bodied" all the same.
_HYPHENS = str.maketrans({"\u2010": "-", "\u2011": "-"})

TEXT_FIELDS = ("summary", "about_role", "about_team")
LIST_FIELDS = ("responsibilities", "requirements", "preferred_qualifications", "skills")


def mentions_protected(text: str) -> bool:
    return PROTECTED.search(text.translate(_HYPHENS)) is not None


def apply_policy(content: JobPostingContent) -> tuple[JobPostingContent, int]:
    """The posting without anything that refers to a protected characteristic, and how many list items
    and sentences were left out."""
    removed = 0
    update: dict[str, Any] = {}
    for field in TEXT_FIELDS:
        update[field], count = _without_protected(getattr(content, field) or "")
        removed += count
    for field in LIST_FIELDS:
        items = getattr(content, field)
        update[field] = [item for item in items if not mentions_protected(item)]
        removed += len(items) - len(update[field])
    update["about_team"] = update["about_team"] or None
    if removed:
        logger.info("Left %d line(s) out of an AI job posting: they referred to a personal characteristic.", removed)
    return content.model_copy(update=update), removed


def _without_protected(text: str) -> tuple[str, int]:
    sentences = _SENTENCE_BREAK.split(text)
    kept = [sentence for sentence in sentences if not mentions_protected(sentence)]
    if len(kept) == len(sentences):
        return text, 0
    return " ".join(kept), len(sentences) - len(kept)
