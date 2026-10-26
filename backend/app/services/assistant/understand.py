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
# Asking the assistant to rank, score, prioritise or judge people, or to decide who to hire or reject.
RANKING = re.compile(
    r"\b(rank\w*|scor\w*|rate|rating|grade|prioriti[sz]\w*)\b.{0,40}\b(candidates?|applicants?|people)\b"
    r"|\b(candidates?|applicants?|people)\b.{0,30}\b(ranked|rankings?|scores?|scored)\b"
    r"|\bwho (should|to|do|would) (we |i )?(hire|reject|advance|turn down|drop|cut|let go)\b"
    r"|\b(weakest|worst|most engaged|least engaged|culture fit|personality)\b|\bauto[- ]?reject\w*",
    re.IGNORECASE,
)
# "The top 10 for the ML Engineer role": not a ranking but a search on job-related criteria, and said so.
TOP = re.compile(r"\b(top|best|strongest)\s+(\d+\s+)?(candidates?|applicants?|matches|people)\b", re.IGNORECASE)

SENSITIVE_REPLY = (
    "I can't look up, filter or use anyone's race, ethnicity, disability status or sexual orientation, and "
    "they're never used in hiring decisions."
)
RANKING_REPLY = (
    "I don't rank, score or judge candidates, and hiring decisions stay with your team. I can show who matches "
    "job-related criteria you choose, with the evidence for each, or list candidates by job or stage."
)


async def understand(
    text: str,
    context: str,
    provider: AIProvider,
    *,
    proposal_kind: rules.ProposalKind = None,
    has_selection: bool = False,
) -> tuple[AssistantIntent, str]:
    """The request as one structured action, and what read it (the model, or "rules")."""
    try:
        intent, read_by = await provider.understand_request(text, context), provider.model
    except AIProviderError as exc:
        if provider.name != "mock":
            logger.warning("assistant.understand_failed provider=%s error=%s", provider.name, exc)
        return rules.parse(text, proposal_kind=proposal_kind, has_selection=has_selection), RULES
    if intent.action == "confirm" and not rules.is_approval(text):
        # Only a plain approval approves: "Okay, add Kubernetes too" is the change it asks for, read again.
        return rules.parse(text, proposal_kind=proposal_kind, has_selection=has_selection), RULES
    return rules.without_excluded_days(intent, text), read_by


def asks_for_top(text: str) -> bool:
    """ "The top 10 candidates": answered as a search on job-related criteria, saying it isn't a ranking."""
    return TOP.search(text) is not None


def policy_refusal(text: str, intent: AssistantIntent, *, names_a_person: bool) -> str | None:
    """Why a request can't be served, or None: anything that would rank people, or tie a personal
    characteristic to anyone."""
    if RANKING.search(text):
        return RANKING_REPLY
    if SENSITIVE.search(text):
        return SENSITIVE_REPLY
    return None
