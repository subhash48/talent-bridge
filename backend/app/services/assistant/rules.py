"""Reads a recruiter's request as a structured action without a language model.

The mock provider uses it, and the engine falls back to it whenever a hosted model fails or answers
with something unusable, so the assistant always works. It reads the action from a few ordered
checks (what kind of request it is), then pulls out the details any action may carry: who it's
about, an interview's type, length and timing, a job title or a stage. Candidate names aren't
guessed here: the engine finds them in the pipeline (services/assistant/resolve.py), so a name is
only ever one that exists.
"""

import re
from typing import Any

from app.core.enums import ApplicationStage
from app.schemas.assistant import AssistantIntent, InterviewDetails

_I = re.IGNORECASE
_DAYS = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"

# What kind of request it is.
_CANCEL = re.compile(r"^\s*(cancel|never ?mind|don'?t send|scrap (it|that)|forget (it|that))\b", _I)
_CONFIRM = re.compile(r"^\s*(yes|yep|yeah|confirm|send it|go ahead|do it|looks good)\b", _I)
_QUESTION = re.compile(r"^\s*(what|when|which|where|how|who|does|did|is|are|has|have|do|can you tell|show|list)\b", _I)
# The communication questions, checked before anything that sends.
_NO_FOLLOW_UP = re.compile(
    r"\binterview\w*\b.{0,60}\b(no|not|without|never|haven'?t|hasn'?t|didn'?t)\b.{0,40}\bfollow[- ]?(up|ed up)"
    r"|\bfollow[- ]?ups?\b.{0,40}\b(after|since)\b.{0,20}\binterview",
    _I,
)
_UNCONFIRMED = re.compile(
    r"\b(unconfirmed|not (been |yet )?confirmed|need(s|ing)? (a )?confirm\w*)\b"
    r"|\binterviews?\b.{0,40}\bconfirm\w*"
    r"|\bconfirm\w*\b.{0,40}\binterviews?\b",
    _I,
)
_UNANSWERED = re.compile(
    r"\bunanswered\b|\bwaiting (for|on) (a |my |our |your )?(reply|response|answer)"
    r"|\b(haven'?t|hasn'?t|not) (been )?(answered|replied)|\bno (reply|response|answer)\b",
    _I,
)
_NEEDS_UPDATE = re.compile(
    r"\b(need|needs|owed?|due|overdue|waiting for)\b.{0,25}\bupdates?\b|\bwho\b.{0,30}\b(waiting|ghost\w*|forgotten)\b"
    r"|\boverdue\b|\bneeds? attention\b",
    _I,
)
_MESSAGE_VERB = re.compile(
    r"\b(email|send|ask|invite|message|reach out|draft|write|compose|remind|tell (?!me\b)|let .{1,40} know|reply to"
    r"|follow up with|update (?!on\b))",
    _I,
)
_INVITATION = re.compile(
    r"\b(schedul\w*|pick|book|set up|arrange|invit\w*|interview (email|invitation|invite|request)"
    r"|(for|to) an? (\w+[- ])?(\w+ )?(interview|call|chat|screen))\b",
    _I,
)
_NEXT_INTERVIEW = re.compile(
    r"\b(next|upcoming)\b.{0,30}\binterview\b|\binterview\b.{0,40}\bnext\b|when is .{0,40}interview", _I
)
_SEARCH = re.compile(r"\b(show|list|find|who|which|search)\b.{0,40}\b(candidates|applicants|people)\b", _I)
_CANDIDATE_INFO = re.compile(
    r"\b(tell me about|summar\w*|how is|what about|status of|update on|where is|background|application)\b", _I
)
_DRAFT_WORDS = re.compile(r"\b(draft|write|prepare|preview|compose)\b", _I)
# Who a request names: a capitalised name after a verb or preposition ("Send Sophia", "for Priya"). Only a
# hint: the engine checks it against the pipeline, and reads the whole request when it matches nobody.
_NAME = re.compile(
    r"\b(?i:send|email|ask|invite|message|tell|telling|let|for|to|about|with|does|is|has|draft|remind|update|write)\s+"
    r"(?P<name>[A-Z][a-zà-ÿ'\-]+(?:\s+[A-Z][a-zà-ÿ'\-]+)?)"
)
_NOT_NAMES = frozenset(
    {
        "a",
        "an",
        "the",
        "our",
        "my",
        "their",
        "next",
        "this",
        "interview",
        "recruiter",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "tomorrow",
        "today",
        "it",
        "them",
        "me",
        "candidates",
        "everyone",
    }
)

# Interview details.
_DURATION = re.compile(r"\b(?P<minutes>\d{2,3})[- ]?(?:minutes?|mins?)\b", _I)
_INTERVIEW_TYPE = re.compile(
    r"\b(?P<kind>recruiter|technical|phone|screening|onsite|on-site|hiring manager|final|culture|design|coding"
    r"|system design|intro\w*|first[- ]round|second[- ]round)\s+(?P<noun>interview|call|screen|chat)\b",
    _I,
)
_TIMEFRAME = re.compile(
    rf"\b(?:(?:next|this|on)\s+(?:{_DAYS}|week|month)(?:\s+(?:morning|afternoon|evening))?"
    rf"|{_DAYS}\s+(?:morning|afternoon|evening)|tomorrow(?:\s+(?:morning|afternoon|evening))?|later this week"
    rf"|early next week|end of (?:the )?week)\b",
    _I,
)

# Searches.
_STAGES = (
    (re.compile(r"\binterview(ing|s)?\b", _I), ApplicationStage.INTERVIEW),
    (re.compile(r"\bscreen(ing|ed)?\b", _I), ApplicationStage.SCREENING),
    (re.compile(r"\boffers?\b", _I), ApplicationStage.OFFER),
    (re.compile(r"\bsourced\b", _I), ApplicationStage.SOURCED),
    (re.compile(r"\bhired\b", _I), ApplicationStage.HIRED),
)
# A title never runs across another "for": "for an interview for the Backend Engineer role".
_FOR_JOB = re.compile(
    r"\b(?:for|on|in) (?:the )?(?P<title>[A-Za-z](?:(?!\bfor\b)[\w/&+.\- ]){2,60}?)(?P<noun> role| job| position|[?.!]|$)",
    _I,
)


def parse(text: str, *, proposal_in_context: bool = False) -> AssistantIntent:
    """The request as one structured action. Unrecognised requests are "help"."""
    action = classify(text, proposal_in_context=proposal_in_context)
    fields: dict[str, Any] = {"action": action}
    if action in ("send_interview_email", "draft_message", "candidate_info", "next_interview"):
        fields["candidate_name"] = name_hint(text)
    if action in ("send_interview_email", "draft_message"):
        fields["mode"] = "draft" if _DRAFT_WORDS.search(text) else "execute"
        fields["instructions"] = text
        fields["job_title"] = _job_for(text)
        if action == "send_interview_email":
            fields["interview"] = interview_details(text)
    elif action == "search_candidates":
        fields["stage"] = next((stage for pattern, stage in _STAGES if pattern.search(text)), None)
        fields["job_title"] = _job_for(text, named=False)
    return AssistantIntent(**fields)


def classify(text: str, *, proposal_in_context: bool = False) -> str:
    if proposal_in_context and _CANCEL.search(text):
        return "cancel"
    if proposal_in_context and _CONFIRM.search(text):
        return "confirm"
    named = name_hint(text) is not None
    asking = bool(_QUESTION.search(text))
    # About one person ("Is Priya's interview confirmed?"): their status, not a list.
    if named and asking and _UNCONFIRMED.search(text):
        return "next_interview"
    if named and asking and (_NO_FOLLOW_UP.search(text) or _UNANSWERED.search(text)):
        return "candidate_info"
    if not named:
        if _NO_FOLLOW_UP.search(text):
            return "no_follow_up"
        if _UNCONFIRMED.search(text) and not _NEXT_INTERVIEW.search(text):
            return "unconfirmed_interviews"
        if _UNANSWERED.search(text):
            return "unanswered"
        if _NEEDS_UPDATE.search(text):
            return "who_needs_update"
    if _QUESTION.search(text) and _NEXT_INTERVIEW.search(text):
        return "next_interview"
    if _MESSAGE_VERB.search(text):
        return "send_interview_email" if _INVITATION.search(text) else "draft_message"
    if _SEARCH.search(text):
        return "search_candidates"
    if _CANDIDATE_INFO.search(text):
        return "candidate_info"
    return "help"


def name_hint(text: str) -> str | None:
    for match in _NAME.finditer(text):
        name = match.group("name").removesuffix("'s")
        if name.split()[0].lower() not in _NOT_NAMES:
            return name
    return None


def interview_details(text: str) -> InterviewDetails:
    duration = _DURATION.search(text)
    minutes = int(duration.group("minutes")) if duration else None
    if minutes is None and re.search(r"\bhalf[- ]an? hour|half-hour\b", text, _I):
        minutes = 30
    elif minutes is None and re.search(r"\b(an|one)[- ]hour\b|\bhour[- ]long\b", text, _I):
        minutes = 60
    kind = _INTERVIEW_TYPE.search(text)
    timeframe = _TIMEFRAME.search(text)
    return InterviewDetails(
        interview_type=f"{kind.group('kind').capitalize()} {kind.group('noun').lower()}" if kind else None,
        duration_minutes=minutes if minutes is not None and 10 <= minutes <= 480 else None,
        timeframe=timeframe.group(0) if timeframe else None,
    )


def _job_for(text: str, *, named: bool = True) -> str | None:
    """The job a request names: "for the Backend Engineer role". named=False also takes a bare title at
    the end ("interviewing for Recruiting Engineer"), which in a message could be a person's name."""
    for match in _FOR_JOB.finditer(text):
        title = match.group("title").strip()
        if named and not match.group("noun").strip(" ?.!"):
            continue
        if re.match(rf"^(an? |the )?(\w+[- ])?(interview|call|chat|{_DAYS}|next|this|tomorrow|\d)", title, _I):
            continue
        return _tidy_title(title)
    return None


def _tidy_title(raw: str) -> str:
    words = raw.strip(" .,").split()
    while words and words[0].lower() in {"a", "an", "the", "new"}:
        words = words[1:]
    text = " ".join(words)
    return text if any(character.isupper() for character in text) else text.title()
