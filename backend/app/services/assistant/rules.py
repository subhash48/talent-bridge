"""Reads a recruiter's request as a structured action without a language model.

The mock provider uses it, and the engine falls back to it whenever a hosted model fails or answers
with something unusable, so the assistant always works. It reads the action from a few ordered
checks (what kind of request it is), then pulls out the details any action may carry: who it's
about, an interview's type, length and timing, a job title, stage, skills or how many to show, and a
job's title, place, arrangement, level, pay and skills. Candidate names aren't guessed here: the
engine finds them in the pipeline (services/assistant/resolve.py), so a name is only ever one that
exists.
"""

import re
from typing import Any, Literal

from app.core.enums import ApplicationStage
from app.schemas.assistant import AssistantIntent, InterviewDetails, JobChanges, ScheduleDetails
from app.services.assistant.schedule import window_from_text

_I = re.IGNORECASE
_DAYS = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
ProposalKind = Literal["message", "outreach", "job"] | None

# What kind of request it is.
_CANCEL = re.compile(
    r"^\s*(?:(?:no|nope|nah)\b[\s,.!]*)?(?:please\s+)?(cancel|never ?mind|don'?t send|do not send|don'?t do (it|that)"
    r"|scrap (it|that|this)|forget (it|that|this)|discard)\b",
    _I,
)
# Approval in so many words: for a job draft on screen, this creates it (and only as a whole approval).
_APPROVE = re.compile(
    r"^\s*(approve\w*|yes,? (create|approve|send)|create (it|the job|this job)|confirm (and|&) (create|send))\b", _I
)
# Approval is the whole request, never its first word: "Yes, send them" approves, while "Okay, remove James
# first" and "Approve it, but make it remote" ask for a change. Read word by word (no backtracking).
_APPROVING = frozenset(
    tuple(phrase.split())
    for phrase in (
        "yes",
        "yep",
        "yeah",
        "yup",
        "sure",
        "confirm",
        "confirmed",
        "ok",
        "okay",
        "alright",
        "all right",
        "sounds good",
        "sounds great",
        "looks good",
        "looks great",
        "all good",
        "good",
        "great",
        "perfect",
        "fine",
        "go ahead",
        "go for it",
        "do it",
        "approve",
        "approved",
        "send",
        "create",
        "ship it",
        "that works",
        "works for me",
        "let's do it",
        "lets do it",
    )
)
_DECLINING = frozenset(
    tuple(phrase.split())
    for phrase in (
        "no",
        "nope",
        "nah",
        "not yet",
        "not now",
        "wait",
        "hold on",
        "hold off",
        "hang on",
        "stop",
        "not so fast",
    )
)
_FILLING = frozenset(
    tuple(phrase.split())
    for phrase in (
        "please",
        "thanks",
        "thank you",
        "now",
        "then",
        "and",
        "it",
        "them",
        "those",
        "these",
        "that",
        "that's",
        "thats",
        "this",
        "all",
        "everything",
        "of them",
        "as is",
        "to me",
        "right away",
        "so",
        "just",
        "out",
        "&",
        "the job",
        "this job",
        "the role",
        "to everyone",
        "to all",
    )
)
# An opening "okay," or "yes, but" before what's actually asked.
_LEAD = re.compile(
    r"^\s*(?:(?:yes|yep|yeah|sure|ok(?:ay)?|alright|great|perfect|good|fine|thanks|thank you|right|actually|wait|hmm"
    r"|well|so|oh|ah|looks good|sounds good|approved?(?: it)?|send (?:it|them)|create it)\b\s*){1,4}"
    r"(?:[,.!;:]+|-+|(?=but\b))\s*"
    r"|^\s*(?:but|and|then|also|actually|first|just|so)\s+",
    _I,
)
# "Don't schedule interviews on Friday", "No, never send that": not a request to do it.
_NEGATED = re.compile(
    r"^\s*(?:(?:no|nope|nah)\b[\s,.!]*)?(?:please\s+)?(?:don'?t|do not|never)\s+(?:\w+\s+){0,2}?"
    r"(?:send|schedul|book|invit|message|email|contact|reach|creat|approv|publish|post|open|draft|writ|propos)\w*\b",
    _I,
)
# A day ruled out: "but not on Friday", "any day except Monday".
_NOT_DAY = re.compile(
    rf"\b(?:not|except|avoid(?:ing)?|excluding|other than|apart from|but not|no)\s+(?:on\s+)?(?:a\s+)?"
    rf"(?:this\s+|next\s+)?(?P<day>{_DAYS})s?\b",
    _I,
)
_QUESTION = re.compile(r"^\s*(what|when|which|where|how|who|does|did|is|are|has|have|do|can you tell|show|list)\b", _I)
# Only a question, never a request to do something: "Did Maya reply?", "Which candidates have unanswered messages?"
_ASKS = re.compile(r"^\s*(what|when|which|where|how|who|why|does|did|is|are|has|have|was|were|do)\b", _I)
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
_SEARCH = re.compile(
    r"\b(show|list|find|who|which|search|filter|narrow|only|give me|pull up)\b.{0,50}\b(candidates|applicants|people"
    r"|matches|ones)\b|^\s*(filter|narrow|only)\b|\bshortlist\b",
    _I,
)
_CANDIDATE_INFO = re.compile(
    r"\b(tell me about|summar\w*|how is|what about|status of|update on|where is|background|application)\b"
    r"|^\s*check (whether|if|on)\b",
    _I,
)
_DRAFT_WORDS = re.compile(r"\b(draft|write|prepare|preview|compose)\b", _I)
# Several candidates at once: the ones ticked, or "these five".
_GROUP = re.compile(
    r"\b(these|those|them|the selected|selected candidates|everyone selected|all of them|each of them|each candidate"
    r"|the candidates|the (\w+ )?shortlist(ed)?|(two|three|four|five|six|seven|eight|nine|ten|\d+) candidates)\b",
    _I,
)
_OUTREACH = re.compile(r"\b(personali[sz]ed|outreach|individual (drafts?|messages?|invit\w*))\b", _I)
_SELECT = re.compile(r"^\s*(?:please\s+)?(?:also\s+)?(select|tick|deselect|unselect|untick|uncheck)\b", _I)
_SELECT_IF_NAMES = re.compile(r"^\s*(?:please\s+)?(?:also\s+)?(?:pick|choose|check)\s+(?P<rest>.+)$", _I)
# Leaving someone out, by name: "Remove James", "drop Maya", "leave James out", "don't include Liam".
_LEAVE_OUT = re.compile(
    r"^\s*(?i:please\s+)?(?i:remove|drop|exclude|skip|leave out|take out|don'?t include|do not include)\s+(?:[Mm]s\.? |[Mm]r\.? )?[A-Z]"
    r"|^\s*(?i:please\s+)?(?i:leave|take)\s+(?P<names>[A-Z][^,.!?]{0,80}?)\s+(?i:out)\b"
)
_REMOVING = re.compile(
    r"^\s*(?:please\s+)?(deselect|unselect|untick|uncheck|remove|drop|exclude|skip|leave|take|don'?t include"
    r"|do not include)\b",
    _I,
)
_CLEAR_SELECTION = re.compile(r"\b(clear|reset)\b.{0,15}\bselection\b|\b(deselect|untick|uncheck) (all|everyone)\b", _I)
_SCHEDULE = re.compile(
    r"\b(schedul\w*|book|set up|arrange|make (these|them|those|it)|propose)\b.{0,60}\binterviews?\b"
    r"|\binterviews?\b.{0,40}\b(next|this|on)\s+" + _DAYS,
    _I,
)
# Who a request names: a capitalised name after a verb or preposition ("Send Sophia", "for Priya"). Only a
# hint: the engine checks it against the pipeline, and reads the whole request when it matches nobody.
_NAME = re.compile(
    r"\b(?i:send|email|ask|invite|message|tell|telling|let|for|to|about|with|does|did|is|was|has|had|draft|remind|update"
    r"|write|whether|if)\s+"
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
        "that",
        "these",
        "those",
        "interview",
        "interviews",
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
        "selected",
        "all",
        "each",
    }
)

# Interview details.
_DURATION = re.compile(r"\b(?P<minutes>\d{2,3})[- ]?(?:minutes?|mins?)\b", _I)
_INTERVIEW_TYPE = re.compile(
    r"\b(?P<kind>recruiter|technical|phone|screening|onsite|on-site|hiring manager|final|culture|design|coding"
    r"|system design|intro\w*|first[- ]round|second[- ]round|first|second|portfolio)\s+(?P<noun>interview|call|screen|chat"
    r"|review)\b",
    _I,
)
_TIMEFRAME = re.compile(
    rf"\b(?:(?:next|this|on)\s+(?:{_DAYS}|week|month)(?:\s+(?:morning|afternoon|evening))?"
    rf"|{_DAYS}\s+(?:morning|afternoon|evening)|tomorrow(?:\s+(?:morning|afternoon|evening))?|later this week"
    rf"|early next week|end of (?:the )?week|{_DAYS})\b",
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
_INTERVIEW_STATES = (
    (
        re.compile(
            r"\binterviewed\b.{0,40}\b(haven'?t|hasn'?t|have not|has not|no|not|without|never)\b.{0,30}"
            r"\b(update|follow[- ]?up|heard|news)",
            _I,
        ),
        "awaiting_update",
    ),
    (re.compile(r"\b(upcoming|booked|scheduled) interviews?\b|\bhave an interview (booked|coming)", _I), "upcoming"),
    (re.compile(r"\b(no|without an?|haven'?t had an?) interviews?\b", _I), "none"),
    (re.compile(r"\b(who|that) (have |has )?interviewed\b|\balready interviewed\b", _I), "interviewed"),
)
_LIMIT = re.compile(
    r"\b(?:top|first|show(?: me)?|find|list|give me|only)?\s*(?P<count>\d{1,3})\s+(?:matching\s+|best\s+|strongest\s+)?"
    r"(?:candidates|applicants|people|matches|profiles)\b"
    r"|\b(?:the\s+)?(?:top|first)\s+(?P<top>\d{1,3})\b",
    _I,
)
_CRITERIA = re.compile(
    r"\b(?:matching|with|who (?:have|has|know|knows|list|lists)|skilled in|that have|requiring|skills?:?)\s+"
    r"(?P<skills>[^.;!?]+)"
    r"|^\s*(?:filter|narrow)(?: (?:it|them|the list))?(?: down)? (?:by|for|on|to)\s+(?P<filter>[^.;!?]+)",
    _I,
)
_CRITERIA_END = re.compile(
    r"\s+(?:for|in|who|currently|at|from|on|that|and (?:who|are|in)|but)\s+.*$|\s+(?:skills?|experience)$", _I
)
_PLACE = re.compile(r"\b(?:in|based in|located in|near)\s+(?P<place>[A-Z][\w.'\-]*(?:,? [A-Z][\w.'\-]*){0,3})")
_NOT_PLACES = re.compile(r"^(?:screening|interview\w*|offer|sourced|hired|the|that|this)\b", _I)
# A title never runs across another "for": "for an interview for the Backend Engineer role".
_FOR_JOB = re.compile(
    r"\b(?:for|on|in) (?:the )?(?P<title>[A-Za-z](?:(?!\bfor\b)[\w/&+.\- ]){2,60}?)(?P<noun> role| job| position|[?.!]|$)",
    _I,
)
_SEARCH_FOR = re.compile(
    r"\b(?:for|to)\s+(?:the\s+)?(?P<title>[A-Za-z][\w/&+.\- ]{1,60}?)(?:\s+(?:role|job|position|opening))?"
    r"(?=\s*[?.!,]|\s+(?:who|with|matching|currently|that|and|in|requiring)\b|\s*$)",
    _I,
)
_NOT_TITLES = re.compile(
    rf"^(?:an? |the )?(?:\w+[- ])?(?:interviews?|call|chat|{_DAYS}|next|tomorrow|\d+|screening|offer|hire|update"
    r"|follow[- ]?up|them|these|those|me|us|everyone|candidates?|applicants?|people)\b",
    _I,
)

# Job details.
_SENIORITY = (
    (re.compile(r"\b(intern|internship)\b", _I), "Internship"),
    (re.compile(r"\b(entry[- ]level|junior|graduate)\b", _I), "Entry Level"),
    (re.compile(r"\bmid[- ]?(level|senior)?\b", _I), "Mid Level"),
    (re.compile(r"\bsenior\b", _I), "Senior"),
    (re.compile(r"\bstaff\b", _I), "Staff"),
    (re.compile(r"\bprincipal\b", _I), "Principal"),
    (re.compile(r"\bdirector\b", _I), "Director"),
)
_ARRANGEMENT = (
    (re.compile(r"\bhybrid\b", _I), "Hybrid"),
    (re.compile(r"\b(fully )?remote\b", _I), "Remote"),
    (re.compile(r"\b(on-?site|in[- ]office|in person)\b", _I), "On-site"),
)
_EMPLOYMENT = (
    (re.compile(r"\bpart[- ]time\b", _I), "Part-time"),
    (re.compile(r"\b(contract|contractor)\b", _I), "Contract"),
    (re.compile(r"\btemporary\b", _I), "Temporary"),
    (re.compile(r"\binternship\b", _I), "Internship"),
    (re.compile(r"\bfull[- ]time\b", _I), "Full-time"),
)
_TITLE = re.compile(
    r"\b(?:create|open|add|post|write|draft|start|set up)\s+(?:(?:a|an|the|one|another|new)\s+)*"
    r"(?P<title>[a-z][\w/&+.\- ]{1,60}?)\s+(?:job|role|position|opening|req(?:uisition)?)\b",
    _I,
)
_NOT_A_TITLE = re.compile(r"\b(email|message|note|interview|letter|reply|for|to|draft)\b", _I)
_CREATE_BARE = re.compile(
    r"\b(create|open|add|post|start)\s+(?:(?:a|an|the|one|new|another)\s+)*(?:job|role|position|opening)\b", _I
)
_RENAME = re.compile(
    r"\b(?:rename (?:it|the job)|change the title|call it)\s+(?:to\s+)?(?P<title>[\w/&+.\- ]{2,60})", _I
)
_LOCATION = re.compile(
    r"\b(?:in|based in|located in|move (?:it )?to|location(?: to| is)?)\s+(?P<place>[A-Z][\w.'\-]*(?:,? [A-Z][\w.'\-]*){0,3})"
)
_LOCATION_ANY = re.compile(
    r"\b(?:based in|located in|location(?: to| is)?)\s+(?P<place>[a-z][a-z .'\-]{1,40}?)(?:[.,;]|$)", _I
)
_SALARY = re.compile(
    r"\$?(?P<low>\d{2,3}(?:[.,]\d)?|\d{4,7})\s*(?:k|,000)?\s*(?:to|-|–|and)\s*\$?(?P<high>\d{2,3}(?:[.,]\d)?|\d{4,7})"
    r"\s*(?:k|,000)?",
    _I,
)
_SALARY_WORDS = re.compile(r"\b(salary|pay|comp\w*|range|base)\b|\d\s*k\b", _I)
_SKILL_LEAD = re.compile(
    r"\b(?:strong in|experience (?:with|in)|skilled in|skills?(?: in| like| such as)?:?|need(?:s|ing)?(?: someone with)?"
    r"|requir(?:e|es|ed|ing)|must have|looking for someone with|knowledge of|proficient in|focus(?:ed)? on)\s+"
    r"(?P<skills>[^.;!?]+)",
    _I,
)
_ADD = re.compile(r"\badd\s+(?P<skills>[^.;!?]+)", _I)
_REMOVE = re.compile(r"\b(?:remove|drop|take out)\s+(?P<skills>[^.;!?]+)", _I)
_SKILL_SPLIT = re.compile(r"\s*(?:,|\band\b|&|\bplus\b)\s*", _I)
_SKILL_FILLER = re.compile(r"^(?:someone |a |an |the |more |also |skills? |strong |experience (?:with|in) |with )+", _I)
_SKILL_TAIL = re.compile(r"(?:\s+(?:experience|skills?|knowledge|background|too|as well|also|please))+$", _I)
_NOT_SKILLS = re.compile(r"^(?:it|them|that|this|those|candidates?|applicants?|people|ones|matches|profiles)$", _I)
_JOB_EDIT = re.compile(
    r"\b(make (it|the)|change|set|add|remove|drop|update|salary|pay|hybrid|remote|on-?site|location|title|rename"
    r"|seniority|level|part[- ]time|full[- ]time|contract)\b",
    _I,
)


def parse(
    text: str, *, proposal_kind: ProposalKind = None, proposal_in_context: bool = False, has_selection: bool = False
) -> AssistantIntent:
    """The request as one structured action. Unrecognised requests are "help". has_selection: the
    recruiter has ticked candidates, so "draft interview invitations" means them."""
    kind = proposal_kind or ("message" if proposal_in_context else None)
    text = _normal(text)
    if not is_approval(text):
        text = core(text)
    action = classify(text, proposal_kind=kind, has_selection=has_selection)
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
        fields.update(search_details(text))
    elif action == "select_candidates":
        leave = _LEAVE_OUT.match(text)
        fields["candidate_names"] = (
            names_listed(f"select {leave.group('names')}") if leave and leave.group("names") else names_listed(text)
        )
        fields["selection"] = (
            "clear"
            if _CLEAR_SELECTION.search(text)
            else "remove"
            if _REMOVING.match(text)
            else "add"
            if re.match(r"^\s*(?:please\s+)?also\b", text, _I)
            else "replace"
        )
    elif action in ("draft_outreach", "schedule_interviews"):
        fields["instructions"] = text
        fields["candidate_names"] = names_listed(text) if not _GROUP.search(text) else []
        details = interview_details(text)
        if (
            action == "schedule_interviews"
            or details.timeframe
            or _INVITATION.search(text)
            or "interview" in text.lower()
        ):
            start, end = window_from_text(text)
            fields["interview"] = details
            if action == "schedule_interviews" or details.timeframe or start:
                fields["schedule"] = ScheduleDetails(**details.model_dump(), window_start=start, window_end=end)
    elif action in ("create_job", "update_job"):
        fields["job"] = job_changes(text, creating=action == "create_job")
    elif action == "confirm":
        fields["mode"] = "execute" if _APPROVE.search(text) else "draft"
    return without_excluded_days(AssistantIntent(**fields), text)


def classify(
    text: str, *, proposal_kind: ProposalKind = None, proposal_in_context: bool = False, has_selection: bool = False
) -> str:
    kind = proposal_kind or ("message" if proposal_in_context else None)
    text = _normal(text)
    if kind and is_approval(text):
        return "confirm"
    text = core(text)
    if kind and _CANCEL.search(text):
        return "cancel"
    if kind == "job" and _JOB_EDIT.search(text) and not _MESSAGE_VERB.search(text):
        return "update_job"
    if is_create(text):
        return "create_job"
    if _SELECT.search(text) or _CLEAR_SELECTION.search(text) or _LEAVE_OUT.search(text) or _picks_names(text):
        return "select_candidates"
    # A question is answered, never turned into drafts for everyone ticked.
    asks = bool(_ASKS.search(text))
    # "Perfect, but make them Wednesday morning instead": new times for the outreach on screen.
    if kind == "outreach" and _RESCHEDULE.search(text):
        return "schedule_interviews"
    group = bool(_GROUP.search(text)) or len(names_listed(text)) > 1
    if not asks and (kind == "outreach" or group) and _SCHEDULE.search(text) and not _OUTREACH.search(text):
        return "schedule_interviews" if kind == "outreach" or not _MESSAGE_VERB.search(text) else "draft_outreach"
    named = name_hint(text) is not None
    # "Send Sophia a personalized email" is one message; "draft personalized outreach" is one each.
    if not asks and ((_OUTREACH.search(text) and not named) or (group and _MESSAGE_VERB.search(text))):
        return "draft_outreach"
    if has_selection and not named and not asks and _MESSAGE_VERB.search(text):
        return "draft_outreach"  # "Draft interview invitations", with candidates ticked
    if has_selection and not named and not asks and _SCHEDULE.search(text):
        return "schedule_interviews"
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
    if _MESSAGE_VERB.search(text) and not asks:
        return "send_interview_email" if _INVITATION.search(text) else "draft_message"
    if _SEARCH.search(text) or _LIMIT.search(text):
        return "search_candidates"
    if _CANDIDATE_INFO.search(text) or (asks and named):
        return "candidate_info"  # "What did Maya say in her last message?"
    return "help"


_RESCHEDULE = re.compile(
    rf"\b(make (it|them|these|those)|move (it|them|these|those)|change (it|them|the times?)|instead|switch|push (it|them))"
    rf"\b.{{0,40}}\b({_DAYS}|tomorrow|morning|afternoon|evening|next week)\b"
    rf"|\b({_DAYS}|tomorrow|next week)\b.{{0,30}}\binstead\b",
    _I,
)


def _normal(text: str) -> str:
    return text.replace("\u2019", "'")


def _words(text: str) -> list[str]:
    return re.findall(r"[^\W_]+(?:'[^\W_]+)?|&", _normal(text).lower())


def _only(text: str, allowed: frozenset[tuple[str, ...]], needed: frozenset[tuple[str, ...]]) -> bool:
    """Whether the request is nothing but these phrases, with at least one of the needed ones."""
    words = _words(text)
    if not words or len(words) > 16:
        return False
    at, seen = 0, False
    while at < len(words):
        for size in (3, 2, 1):
            part = tuple(words[at : at + size])
            if len(part) == size and part in allowed:
                seen = seen or part in needed
                at += size
                break
        else:
            return False
    return seen


def is_approval(text: str) -> bool:
    """ "Yes", "Looks good, send them", "Approve & create": an approval and nothing else."""
    return _only(text, _APPROVING | _FILLING, _APPROVING)


def declines(text: str) -> bool:
    """ "No", "Not yet", "Wait": nothing should happen, and nothing is discarded."""
    return _only(text, _DECLINING | _FILLING, _DECLINING)


def negated(text: str) -> bool:
    """ "Don't schedule interviews on Friday": a request not to do something, never a request to do it."""
    return _NEGATED.search(_normal(text)) is not None


def core(text: str) -> str:
    """What's asked after an opening "okay," or "yes, but": "Okay, remove James first" is "remove James first"."""
    rest = text
    for _ in range(4):
        stripped = _LEAD.sub("", rest, count=1)
        if stripped == rest:
            break
        rest = stripped
    return rest if rest.strip() else text


def excluded_days(text: str) -> set[str]:
    return {match.group("day").lower() for match in _NOT_DAY.finditer(text)}


def without_excluded_days(intent: AssistantIntent, text: str) -> AssistantIntent:
    """A day the recruiter ruled out ("but not on Friday") is never taken as the day."""
    days = excluded_days(_normal(text))
    if not days:
        return intent
    update: dict[str, Any] = {}
    for name in ("schedule", "interview"):
        details = getattr(intent, name)
        if details is not None and details.timeframe and any(day in details.timeframe.lower() for day in days):
            update[name] = details.model_copy(update={"timeframe": None})
    return intent.model_copy(update=update) if update else intent


def name_hint(text: str) -> str | None:
    for match in _NAME.finditer(text):
        name = match.group("name").removesuffix("'s")
        if name.split()[0].lower() not in _NOT_NAMES:
            return name
    return None


_LISTING = re.compile(
    r"\b(?:select|pick|tick|choose|check|deselect|unselect|untick|uncheck|remove|drop|exclude|skip|include|send|invite"
    r"|email|message|remind|for|to)\s+(?P<rest>.+)$",
    _I,
)
_LEADING_NAME = re.compile(r"(?:[A-Z][\w'\-]*)(?:\s+[A-Z][\w'\-]*){0,2}")
_BEFORE_NAMES = re.compile(r"^(?:both|only|just|also|candidates?|applicants?|people)\s+", _I)


def names_listed(text: str) -> list[str]:
    """ "Select Sophia, Maya and James" is three names, and "Invite Sophia and Maya to an interview" two:
    the names right after a verb or "for"/"to", each one as said. A verb followed by something else
    ("Send an update to Sophia and Maya") is skipped for the next one."""
    at = 0
    while (match := _LISTING.search(text, at)) is not None:
        names = []
        for part in re.split(
            r"\s*(?:,|\band\b|&|\bplus\b)\s*", _BEFORE_NAMES.sub("", match.group("rest").strip(" .!?"))
        ):
            name = _LEADING_NAME.match(part)
            if name is None or name.group(0).split()[0].lower() in _NOT_NAMES:
                break
            names.append(name.group(0).removesuffix("'s"))
        if names:
            return names
        at = match.start("rest")
    return []


def _picks_names(text: str) -> bool:
    """ "Pick Sophia and Maya", "Check James": the verb, then only names."""
    match = _SELECT_IF_NAMES.match(text)
    if not match:
        return False
    parts = re.split(
        r"\s*(?:,|\band\b|&)\s*", re.sub(r"\s+(?:too|as well|also)$", "", match.group("rest").strip(" .!?"))
    )
    return all(
        (name := _LEADING_NAME.fullmatch(part)) is not None and name.group(0).split()[0].lower() not in _NOT_NAMES
        for part in parts
    )


def is_create(text: str) -> bool:
    title = _TITLE.search(text)
    if title and not _NOT_A_TITLE.search(title.group("title")):
        return True
    return bool(_CREATE_BARE.search(text))


def interview_details(text: str) -> InterviewDetails:
    duration = _DURATION.search(text)
    minutes = int(duration.group("minutes")) if duration else None
    if minutes is None and re.search(r"\bhalf[- ]an? hour|half-hour\b", text, _I):
        minutes = 30
    elif minutes is None and re.search(r"\b(an|one)[- ]hour\b|\bhour[- ]long\b", text, _I):
        minutes = 60
    kind = _INTERVIEW_TYPE.search(text)
    timeframe = _TIMEFRAME.search(_NOT_DAY.sub(" ", text))
    return InterviewDetails(
        interview_type=f"{kind.group('kind').capitalize()} {kind.group('noun').lower()}" if kind else None,
        duration_minutes=minutes if minutes is not None and 10 <= minutes <= 480 else None,
        timeframe=timeframe.group(0) if timeframe else None,
    )


def search_details(text: str) -> dict[str, Any]:
    """What a search names: the job, the criteria, the stage, where, how many and interview progress. Only
    job-related things are ever read."""
    fields: dict[str, Any] = {}
    state = next((value for pattern, value in _INTERVIEW_STATES if pattern.search(text)), None)
    if state:
        fields["interview_state"] = state
    without_progress = re.sub(r"\binterview\w*\b.*$", "", text, flags=_I) if state else text
    fields["stage"] = next((stage for pattern, stage in _STAGES if pattern.search(without_progress)), None)
    limit = _LIMIT.search(text)
    count = int(limit.group("count") or limit.group("top")) if limit else 0
    if 1 <= count <= 200:
        fields["limit"] = count
    criteria = _CRITERIA.search(text)
    rest = text
    if criteria:
        said = criteria.group("skills") or criteria.group("filter")
        skills = _CRITERIA_END.sub("", said)
        fields["skills"] = _skill_list(skills)
        # The skills are never also read as the job ("Filter for Python and AWS" isn't a job called Python).
        start = criteria.start("skills" if criteria.group("skills") else "filter")
        rest = text[: criteria.start()] + text[start + len(skills) :]
    title = _search_job(rest)
    if title:
        fields["job_title"] = title
    place = _PLACE.search(text)
    if place and not _NOT_PLACES.match(place.group("place")):
        fields["location"] = place.group("place").strip(" .,")
    fields["refine"] = bool(re.match(r"^\s*(only|filter|narrow|just)\b", text, _I))
    return fields


def _search_job(text: str) -> str | None:
    """ "for the Machine Learning Engineer job", "for Product Designer", "for that role"."""
    named = _job_for(text)
    if named:
        return named
    for match in _SEARCH_FOR.finditer(text):
        title = match.group("title").strip()
        if re.match(r"^(?:that|this|it)\b", title, _I):
            return "that role"
        if not _NOT_TITLES.match(title) and any(word[:1].isupper() for word in title.split()):
            return _tidy_title(title)
    return None


def job_changes(text: str, *, creating: bool) -> JobChanges:
    title = _TITLE.search(text) if creating else _RENAME.search(text)
    if title and creating and _NOT_A_TITLE.search(title.group("title")):
        title = None
    low, high = salary_range(text)
    location = _LOCATION.search(text) or _LOCATION_ANY.search(text)
    added = _skills(_SKILL_LEAD, text) + _skills(_ADD, text) if creating else _skills(_ADD, text)
    return JobChanges(
        title=_tidy_title(title.group("title")) if title else None,
        location=_tidy_place(location.group("place")) if location else None,
        work_arrangement=_first(_ARRANGEMENT, text),
        employment_type=_first(_EMPLOYMENT, text),
        seniority=_first(_SENIORITY, text),
        salary_min=low,
        salary_max=high,
        skills_add=list(dict.fromkeys(added)),
        skills_remove=_skills(_REMOVE, text),
        notes=text[:1000] if creating else None,
    )


def salary_range(text: str) -> tuple[int | None, int | None]:
    """A yearly range in whole units: "90 to 120K", "$90k-$120k", "100 to 130" (thousands)."""
    if not _SALARY_WORDS.search(text):
        return None, None
    for match in _SALARY.finditer(text):
        tail = text[match.end() : match.end() + 12].lower()
        if re.match(r"\s*(minutes?|mins?|hours?|days?|%|percent|pm|am)", tail):
            continue
        low, high = _amount(match.group("low")), _amount(match.group("high"))
        if 0 < low <= high:
            return low, high
    return None, None


def _amount(raw: str) -> int:
    value = float(raw.replace(",", "."))
    return int(value * 1000) if value < 1000 else int(value)


def _skills(pattern: re.Pattern[str], text: str) -> list[str]:
    skills: list[str] = []
    for match in pattern.finditer(text):
        skills += _skill_list(match.group("skills"))
    return skills


def _skill_list(raw: str) -> list[str]:
    skills: list[str] = []
    for part in _SKILL_SPLIT.split(raw):
        skill = _SKILL_TAIL.sub("", _SKILL_FILLER.sub("", part.strip(" ."))).strip()
        if not 1 < len(skill) <= 40 or _SALARY.search(skill) or _NOT_SKILLS.match(skill):
            continue
        skills.append(skill[0].upper() + skill[1:] if skill[0].islower() else skill)
    return list(dict.fromkeys(skills))


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


def _first(table: tuple[tuple[re.Pattern[str], str], ...], text: str) -> Any:
    return next((value for pattern, value in table if pattern.search(text)), None)


def _tidy_title(raw: str) -> str:
    words = raw.strip(" .,").split()
    while words and words[0].lower() in {"a", "an", "the", "new"}:
        words = words[1:]
    text = " ".join(words)
    return text if any(character.isupper() for character in text) else text.title()


def _tidy_place(raw: str) -> str:
    place = re.split(
        r"\.\s|\b(?:hybrid|remote|on-?site|salary|with|for|requiring|full-time|part-time)\b", raw, flags=_I
    )[0]
    place = place.strip(" .,")
    return place if any(character.isupper() for character in place) else place.title()
