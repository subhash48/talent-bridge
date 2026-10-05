"""What a portal interaction was about: the categories of "What candidates are looking for".

One table maps each kind of portal event to a topic (topic_for_event). Questions to the portal
assistant are classified once, when they're asked (topic_for_question), and only the topic is kept:
the question itself never leaves the candidate's conversation. Interactions that aren't about a topic
(opening the dashboard, the inbox or the profile) count towards nothing here.

Questions are matched first on the analytics-only categories (pay, benefits, culture and team), then
fall back to the topics the candidate assistant already detects (services/ai/portal_fallback.py), so
both read a question the same way.
"""

import re
from typing import Any

from app.core.enums import CompanySection, EngagementEventType, PortalPage, PortalTopic
from app.services.ai.portal_fallback import topic_of

T = PortalTopic

LABELS: dict[PortalTopic, str] = {
    T.INTERVIEW_PREPARATION: "Interview preparation",
    T.COMPANY_INFORMATION: "Company information",
    T.APPLICATION_STATUS: "Application status",
    T.COMPENSATION: "Salary & compensation",
    T.BENEFITS: "Benefits & perks",
    T.CULTURE_TEAM: "Culture & team",
}

PAGE_TOPICS: dict[str, PortalTopic] = {
    PortalPage.PREP: T.INTERVIEW_PREPARATION,
    PortalPage.INTERVIEWS: T.INTERVIEW_PREPARATION,
    PortalPage.APPLICATION: T.APPLICATION_STATUS,
    PortalPage.APPLICATIONS: T.APPLICATION_STATUS,
    PortalPage.COMPANY: T.COMPANY_INFORMATION,
}
SECTION_TOPICS: dict[str, PortalTopic] = {
    CompanySection.BENEFITS: T.BENEFITS,
    CompanySection.CULTURE: T.CULTURE_TEAM,
    CompanySection.PRODUCTS: T.COMPANY_INFORMATION,
    CompanySection.LOCATIONS: T.COMPANY_INFORMATION,
    CompanySection.HIRING: T.INTERVIEW_PREPARATION,
}
EVENT_TOPICS: dict[str, PortalTopic] = {
    EngagementEventType.APPLICATION_VIEWED: T.APPLICATION_STATUS,
    EngagementEventType.INTERVIEW_VIEWED: T.INTERVIEW_PREPARATION,
    EngagementEventType.PREP_VIEWED: T.INTERVIEW_PREPARATION,
}
# The events that can carry a topic, for the query that counts them.
TOPIC_EVENTS: tuple[str, ...] = (
    EngagementEventType.PAGE_VIEW,
    EngagementEventType.COMPANY_SECTION_VIEWED,
    EngagementEventType.AI_QUESTION_ASKED,
    *EVENT_TOPICS,
)

_QUESTION_TOPICS: tuple[tuple[PortalTopic, re.Pattern[str]], ...] = (
    (
        T.COMPENSATION,
        re.compile(
            r"\b(salar\w*|pay|compensation|wages?|bonus\w*|equity|stock options?|rsus?|money)\b",
            re.IGNORECASE,
        ),
    ),
    (
        T.BENEFITS,
        re.compile(
            r"\b(benefits?|perks?|pto|vacation|holidays?|time off|leave|insurance|health\w*|dental|pension|401k"
            r"|parental|stipend|wellness|learning budget)\b",
            re.IGNORECASE,
        ),
    ),
    (
        T.CULTURE_TEAM,
        re.compile(
            r"\b(culture|values|team|teammates?|colleagues?|manager|work[- ]life|diversity|inclusion|environment"
            r"|people like)\b",
            re.IGNORECASE,
        ),
    ),
)
_ASSISTANT_TOPICS: dict[str, PortalTopic] = {
    "prepare": T.INTERVIEW_PREPARATION,
    "review": T.INTERVIEW_PREPARATION,
    "questions": T.INTERVIEW_PREPARATION,
    "process": T.INTERVIEW_PREPARATION,
    "logistics": T.INTERVIEW_PREPARATION,
    "general": T.APPLICATION_STATUS,
    "private": T.APPLICATION_STATUS,
    "company": T.COMPANY_INFORMATION,
    "role": T.COMPANY_INFORMATION,
}


def topic_for_question(question: str) -> PortalTopic:
    """A question's topic. Always one of the categories: anything else reads as application status."""
    for topic, pattern in _QUESTION_TOPICS:
        if pattern.search(question):
            return topic
    return _ASSISTANT_TOPICS.get(topic_of(question), T.APPLICATION_STATUS)


def topic_for_event(event_type: str, metadata: dict[str, Any] | None) -> PortalTopic | None:
    """A recorded portal event's topic, or None for one that isn't about any."""
    meta = metadata or {}
    if event_type == EngagementEventType.PAGE_VIEW:
        return PAGE_TOPICS.get(meta.get("target") or "")
    if event_type == EngagementEventType.COMPANY_SECTION_VIEWED:
        return SECTION_TOPICS.get(meta.get("target") or "")
    if event_type == EngagementEventType.AI_QUESTION_ASKED:
        topic = meta.get("topic")
        return PortalTopic(topic) if topic in PortalTopic._value2member_map_ else None
    return EVENT_TOPICS.get(event_type)
