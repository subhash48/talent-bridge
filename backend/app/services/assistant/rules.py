"""Reads a recruiter's request as a structured action without a language model.

The mock provider uses it, and the engine falls back to it whenever a hosted model fails or answers
with something unusable, so the assistant always works. It reads the action from a few ordered
checks (what kind of request it is), then pulls out the details any action may carry: an interview's
type, length and timing, a job's title, location, arrangement, pay and skills, an analytics
question's metric and period. Candidate names aren't guessed here: the engine finds them in the
pipeline (services/assistant/resolve.py), so a name is only ever one that exists.
"""

import re
from typing import Any

from app.core.enums import ApplicationStage
from app.schemas.assistant import AnalyticsMetric, AnalyticsPeriodName, AssistantIntent, InterviewDetails, JobChanges

_I = re.IGNORECASE
_DAYS = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"

# What kind of request it is.
_CANCEL = re.compile(r"^\s*(cancel|never ?mind|don'?t send|scrap (it|that)|forget (it|that))\b", _I)
_CONFIRM = re.compile(r"^\s*(yes|yep|yeah|confirm|send it|go ahead|do it|publish it|post it|ship it|looks good)\b", _I)
_PUBLISH = re.compile(r"\b(publish|go live|make (it|the job) live|post (it|the job|the role))\b", _I)
_QUESTION = re.compile(r"^\s*(what|when|which|where|how|who|does|did|is|are|has|have|do|can you tell)\b", _I)
_ANALYTICS_NOUNS = re.compile(
    r"\b(portal|engagement|analytics|demograph\w*|regions?|countr\w*|ethnicit\w*|race|disabilit\w*|orientation"
    r"|visits?|repeat visit|respondents?|identif\w* as)\b",
    _I,
)
_ANALYTICS_QUESTIONS = re.compile(r"\b(looking for|searching for|interested in|most active|engaged|asking about)\b", _I)
_MESSAGE_VERB = re.compile(
    r"\b(email|send|ask|invite|message|reach out|draft|write|compose|tell (?!me\b)|let .{1,40} know|reply to"
    r"|follow up with)",
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
_JOB_EDIT = re.compile(
    r"\b(make (it|the)|change|set|add|remove|drop|update|shorter|shorten|longer|tighten|salary|pay|hybrid|remote"
    r"|on-?site|location|title|rename|seniority|description)\b",
    _I,
)
_LIST_JOBS = re.compile(r"\b(open (jobs|roles|positions)|my jobs|(show|list|which|what) .{0,20}\b(jobs|roles))\b", _I)
_SEARCH = re.compile(r"\b(show|list|find|who|which|search)\b.{0,40}\b(candidates|applicants|people)\b", _I)
_CANDIDATE_INFO = re.compile(
    r"\b(tell me about|summar\w*|how is|what about|status of|update on|background|application|strengths|concerns)\b", _I
)
_DRAFT_WORDS = re.compile(r"\b(draft|write|prepare|preview|compose)\b", _I)
# Who a request names: a capitalised name after a verb or preposition ("Send Sophia", "for Priya"). Only a
# hint: the engine checks it against the pipeline, and reads the whole request when it matches nobody.
_NAME = re.compile(
    r"\b(?i:send|email|ask|invite|message|tell|telling|let|for|to|about|with|does|is|has)\s+"
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
    }
)

# Job details.
_SENIORITY = (
    (re.compile(r"\b(intern|internship)\b", _I), "Internship"),
    (re.compile(r"\b(entry[- ]level|junior|graduate)\b", _I), "Entry Level"),
    (re.compile(r"\bmid[- ]level\b", _I), "Mid Level"),
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
    (re.compile(r"\bfull[- ]time\b", _I), "Full-time"),
)
_LEVELS = r"(?:entry[- ]level|junior|mid[- ]level|senior|staff|principal|lead|new)"
_TITLE = re.compile(
    rf"\b(?:create|open|add|post|write|draft|start)\s+(?:(?:a|an|the|one|another)\s+)?(?:{_LEVELS}\s+)*"
    r"(?P<title>[a-z][\w/&+.\- ]{1,60}?)\s+(?:job|role|position|opening|req(?:uisition)?)\b",
    _I,
)
_NOT_A_TITLE = re.compile(r"\b(email|message|note|interview|letter|reply|for|to)\b", _I)
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
    r"\b(?:strong in|experience (?:with|in)|skilled in|skills?(?: in| like| such as)?:?|need(?:s)?(?: someone with)?"
    r"|looking for someone with|knowledge of|proficient in|focus(?:ed)? on)\s+(?P<skills>[^.;!?]+)",
    _I,
)
_ADD = re.compile(r"\badd\s+(?P<skills>[^.;!?]+)", _I)
_REMOVE = re.compile(r"\b(?:remove|drop|take out)\s+(?P<skills>[^.;!?]+)", _I)
_SKILL_SPLIT = re.compile(r"\s*(?:,|\band\b|&)\s*", _I)
_SKILL_FILLER = re.compile(r"^(?:someone |a |an |the |more |also |skills? |strong |experience (?:with|in) )+", _I)
_SHORTER = re.compile(r"\b(shorter|shorten|tighten|more concise|trim|cut down)\b", _I)

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

# Analytics questions.
_METRICS: tuple[tuple[AnalyticsMetric, re.Pattern[str]], ...] = (
    (
        "demographics",
        re.compile(
            r"\b(demograph\w*|ethnicit\w*|race|disabilit\w*|orientation|lgbt\w*|respondents?|identif\w* as)\b", _I
        ),
    ),
    ("regions", re.compile(r"\b(regions?|countr\w*|where .{0,30}\bfrom|locations?)\b", _I)),
    ("peak_activity", re.compile(r"\b(what time|when .{0,30}active|most active|peak|busiest|time of day)\b", _I)),
    (
        "top_topics",
        re.compile(r"\b(searching|looking for|interested in|topics?|asking about|want to know|care about)\b", _I),
    ),
    (
        "engagement_change",
        re.compile(r"\b(change|changed|increase|decrease|compared|trend|grow\w*|drop\w*|up or down)\b", _I),
    ),
    ("repeat_visit_rate", re.compile(r"\b(repeat|return\w*|come back|came back)\b", _I)),
    ("avg_engagement_time", re.compile(r"\b(how long|time spent|session length|duration|average time)\b", _I)),
    ("weekly_engaged", re.compile(r"\bengaged\b", _I)),
    ("active_candidates", re.compile(r"\b(how many|number of|active|used the portal|using the portal)\b", _I)),
)
_DIMENSIONS = (
    ("race_ethnicity", re.compile(r"\b(race|ethnicit\w*|asian|black|hispanic|latin\w*|white)\b", _I)),
    ("disability_status", re.compile(r"\bdisabilit\w*\b", _I)),
    ("sexual_orientation", re.compile(r"\b(orientation|lgbt\w*|gay|lesbian|bisexual|queer)\b", _I)),
)
_PERIODS: tuple[tuple[AnalyticsPeriodName, re.Pattern[str]], ...] = (
    ("today", re.compile(r"\btoday\b", _I)),
    ("last_month", re.compile(r"\blast month\b", _I)),
    ("this_month", re.compile(r"\b(this month|past month|30 days|month)\b", _I)),
    ("last_90_days", re.compile(r"\b(quarter|90 days|three months|3 months)\b", _I)),
    ("this_year", re.compile(r"\b(this year|year to date|ytd|year)\b", _I)),
    ("this_week", re.compile(r"\b(this week|past week|7 days|seven days|week)\b", _I)),
)


def parse(text: str, *, job_in_context: bool = False, proposal_in_context: bool = False) -> AssistantIntent:
    """The request as one structured action. Unrecognised requests are "help"."""
    action = classify(text, job_in_context=job_in_context, proposal_in_context=proposal_in_context)
    fields: dict[str, Any] = {"action": action}
    if action in ("send_interview_email", "draft_message", "candidate_info", "next_interview"):
        fields["candidate_name"] = name_hint(text)
    if action in ("send_interview_email", "draft_message"):
        fields["mode"] = "draft" if _DRAFT_WORDS.search(text) else "execute"
        fields["instructions"] = text
        fields["job_title"] = _job_for(text)
        if action == "send_interview_email":
            fields["interview"] = interview_details(text)
    elif action in ("create_job", "update_job"):
        fields["job"] = job_changes(text, creating=action == "create_job")
    elif action == "publish_job":
        fields["mode"] = "execute"
        fields["job_title"] = _job_for(text)
    elif action == "analytics":
        fields["metric"] = next((metric for metric, pattern in _METRICS if pattern.search(text)), "overview")
        fields["period"] = next((period for period, pattern in _PERIODS if pattern.search(text)), None)
        if fields["metric"] == "demographics":
            fields["demographic"] = next((name for name, pattern in _DIMENSIONS if pattern.search(text)), None)
    elif action == "search_candidates":
        fields["stage"] = next((stage for pattern, stage in _STAGES if pattern.search(text)), None)
        fields["job_title"] = _job_for(text, named=False)
    return AssistantIntent(**fields)


def classify(text: str, *, job_in_context: bool = False, proposal_in_context: bool = False) -> str:
    if proposal_in_context and _CANCEL.search(text):
        return "cancel"
    if proposal_in_context and _CONFIRM.search(text):
        return "confirm"
    if _PUBLISH.search(text):
        return "publish_job"
    if is_create(text):
        return "create_job"
    if _ANALYTICS_NOUNS.search(text) or (_QUESTION.search(text) and _ANALYTICS_QUESTIONS.search(text)):
        return "analytics"
    if job_in_context and _JOB_EDIT.search(text) and not _MESSAGE_VERB.search(text):
        return "update_job"
    if _QUESTION.search(text) and _NEXT_INTERVIEW.search(text):
        return "next_interview"
    if _MESSAGE_VERB.search(text):
        return "send_interview_email" if _INVITATION.search(text) else "draft_message"
    if _LIST_JOBS.search(text):
        return "list_jobs"
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
    timeframe = _TIMEFRAME.search(text)
    return InterviewDetails(
        interview_type=f"{kind.group('kind').capitalize()} {kind.group('noun').lower()}" if kind else None,
        duration_minutes=minutes if minutes is not None and 10 <= minutes <= 480 else None,
        timeframe=timeframe.group(0) if timeframe else None,
    )


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
        notes=text if creating else None,
        shorter=bool(_SHORTER.search(text)),
    )


def salary_range(text: str) -> tuple[int | None, int | None]:
    """A yearly range in whole units: "90 to 120K", "$90k-$120k", "100 to 130" (thousands)."""
    if not _SALARY_WORDS.search(text):
        return None, None
    for match in _SALARY.finditer(text):
        tail = text[match.end() : match.end() + 12].lower()
        if re.match(r"\s*(minutes?|mins?|hours?|days?|%|percent)", tail):
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
        for part in _SKILL_SPLIT.split(match.group("skills")):
            skill = _SKILL_FILLER.sub("", part.strip(" .")).strip()
            if not 1 < len(skill) <= 40 or _SALARY.search(skill) or re.match(r"^(it|them|that|this)$", skill, _I):
                continue
            skills.append(skill[0].upper() + skill[1:] if skill.islower() else skill)
    return skills


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
    place = re.split(r"\b(?:hybrid|remote|on-?site|salary|with|for)\b", raw, flags=_I)[0].strip(" .,")
    return place if any(character.isupper() for character in place) else place.title()
