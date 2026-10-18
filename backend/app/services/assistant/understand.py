"""From words to one structured action, and the policy checks every request passes first.

The configured model reads the request (provider.understand_request); the rules in rules.py read it
when there's no model (the mock provider) or the model fails. Either way the result is the same kind
of AssistantIntent, so typed and spoken requests, with or without a model, take the same path.
"""

import logging
import re

from app.schemas.assistant import AssistantIntent
from app.services.ai.client import AIProvider, AIProviderError
from app.services.assistant import rules

logger = logging.getLogger(__name__)

RULES = "rules"

# Personal characteristics the assistant never looks up, filters, ranks or writes about for anyone.
SENSITIVE = re.compile(
    r"\b(race|racial|ethnicit\w*|ethnic|disabilit\w*|sexual\w*|sexual orientation|gay|lesbian|bisexual|queer|asexual"
    r"|heterosexual|lgbt\w*|hispanic|latin[oax]|asian|black|white|middle eastern)\b",
    re.IGNORECASE,
)
# Asking the assistant to rank, score or prioritise people.
RANKING = re.compile(
    r"\b(rank\w*|scor\w*|rate|rating|prioriti[sz]\w*|shortlist\w*)\b.{0,40}\b(candidates?|applicants?|people)\b"
    r"|\b(best|strongest|weakest|top|most engaged|least engaged)\s+(\d+\s+)?(candidates?|applicants?)\b",
    re.IGNORECASE,
)

SENSITIVE_REPLY = (
    "I can't look up, filter or use anyone's race, ethnicity, disability status or sexual orientation, and "
    "they're never used in hiring decisions."
)
RANKING_REPLY = (
    "I don't rank, score or prioritise candidates: hiring decisions stay with your team. I can tell you who needs "
    "an update, or list candidates by job or stage."
)


async def understand(
    text: str,
    context: str,
    provider: AIProvider,
    *,
    proposal_in_context: bool,
) -> tuple[AssistantIntent, str]:
    """The request as one structured action, and what read it (the model, or "rules")."""
    try:
        return await provider.understand_request(text, context), provider.model
    except AIProviderError as exc:
        if provider.name != "mock":
            logger.warning("assistant.understand_failed provider=%s error=%s", provider.name, exc)
    return rules.parse(text, proposal_in_context=proposal_in_context), RULES


def policy_refusal(text: str, intent: AssistantIntent, *, names_a_person: bool) -> str | None:
    """Why a request can't be served, or None: anything that would rank people, or tie a personal
    characteristic to anyone."""
    if RANKING.search(text):
        return RANKING_REPLY
    if SENSITIVE.search(text):
        return SENSITIVE_REPLY
    return None
