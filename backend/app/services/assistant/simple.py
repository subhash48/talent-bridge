"""How a small business owner says what they want, read the same way typed or spoken.

    "I need two workers for my restaurant. Evening shift, $18 an hour. They should have kitchen
     experience and be available Friday and Saturday."

is a job: Kitchen Assistant, $18/hour, evenings, Friday and Saturday, 2 openings, kitchen experience.
"Show me 3 applicants available weekends with customer service experience" is a search with an
availability filter. "Give me their phone numbers" asks for the contact details applicants gave. "Ask
them if they can come Tuesday between 2 and 5" asks the ticked applicants to an interview.

These read only what was said. A job title is the one said, or, when only the work is described
("workers for my restaurant ... kitchen experience"), the plain title for that work, marked as a
suggestion for the owner to check. Pay, shift, days and openings are never guessed: what isn't said
stays empty. refine() applies all of this to the intent the model or the rules produced, so either
reader ends up with the same structured action.
"""

import re
from datetime import date

from app.core.enums import WEEKEND, Weekday
from app.schemas.assistant import (
    AssistantCard,
    AssistantIntent,
    CandidateMatchCard,
    JobChanges,
    OutreachCard,
    OutreachItem,
    ScheduleDetails,
)
from app.services import personal_characteristics
from app.services.assistant import rules
from app.services.assistant.schedule import window_from_text

_I = re.IGNORECASE
WEEKDAYS: tuple[Weekday, ...] = tuple(day for day in Weekday if day not in WEEKEND)
_DAY_WORDS: dict[str, tuple[Weekday, ...]] = {
    **{day.value: (day,) for day in Weekday},
    **{day.value[:3]: (day,) for day in Weekday},
    "tues": (Weekday.TUESDAY,),
    "weds": (Weekday.WEDNESDAY,),
    "thur": (Weekday.THURSDAY,),
    "thurs": (Weekday.THURSDAY,),
    "weekend": WEEKEND,
    "weekends": WEEKEND,
    "weekday": WEEKDAYS,
    "weekdays": WEEKDAYS,
}
_DAY = re.compile(
    r"\b(?P<day>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|weds|thu|thur|thurs|fri"
    r"|sat|sun|weekends?|weekdays?)s?\b",
    _I,
)
_EVERY_DAY = re.compile(r"\b(every day|daily|7 days a week|seven days a week|all week)\b", _I)

# "$18 an hour", "$18/hr", "$18 hourly", "18 dollars an hour", "£11.50 per hour", "$1000 a week", and a range:
# "$15-18 an hour", "$15 to $18 an hour", "between $15 and $18 an hour".
_AMOUNT = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"
_PAY = re.compile(
    rf"(?P<symbol>[$£€])\s?(?P<amount>{_AMOUNT})(?:\s*(?:-|–|to|and)\s*[$£€]?\s?(?P<high>{_AMOUNT}))?"
    r"(?:\s*(?:dollars|bucks))?"
    r"(?:\s*(?:an?|per|/|each|every)\s*(?P<period>hour|hr|h|day|shift|week|wk|month|year|yr)"
    r"|\s*(?P<ly>hourly|daily|weekly|monthly|yearly|annually))?\b"
    r"|(?P<bare>\d{1,3}(?:\.\d{1,2})?)\s*(?:dollars|bucks)\s*(?:an?|per|/)\s*(?P<bare_period>hour|hr|day|shift|week)\b",
    _I,
)
_PERIODS = {"hour": "hour", "hr": "hour", "h": "hour", "day": "day", "shift": "shift", "week": "week", "wk": "week"}
_PERIODS |= {"month": "month", "year": "year", "yr": "year", "hourly": "hour", "daily": "day", "weekly": "week"}
_PERIODS |= {"monthly": "month", "yearly": "year", "annually": "year"}
_PAY_WORDS = re.compile(r"\b(pay|paying|pays|wage|rate|salary|an hour|per hour|/h(ou)?r)\b", _I)

_SHIFTS = (
    (re.compile(r"\b(over\s?night|graveyard)\b", _I), "Overnight"),
    (re.compile(r"\b(evening|night)(s| shifts?)?\b", _I), "Evenings"),
    (re.compile(r"\bmornings?( shifts?)?\b|\bearly shifts?\b", _I), "Mornings"),
    (re.compile(r"\bafternoons?( shifts?)?\b", _I), "Afternoons"),
    (re.compile(r"\b(lunch|lunchtime)( shifts?)?\b", _I), "Lunchtimes"),
    (re.compile(r"\bweekend shifts?\b", _I), "Weekends"),
)
# Only where it describes the work: "Evening shift", "for evenings", "works nights"; never "tomorrow evening".
_SHIFT_CONTEXT = re.compile(
    r"\bshifts?\b|\b(evenings|nights|mornings|afternoons|weekends)\b|\b(work|working|available)\s+(in the\s+)?(evening|night|morning)",
    _I,
)

_NUMBERS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}
_NUMBERS |= {"eight": 8, "nine": 9, "ten": 10, "a couple of": 2, "a few": 3, "couple of": 2}
_PEOPLE = (
    r"workers?|people|staff|employees|hires|hands|helpers?|openings?|positions?|spots|team members?|cashiers?|cooks?"
    r"|baristas?|servers?|waiters?|waitresses?|drivers?|cleaners?|dishwashers?|bartenders?|hosts?|associates?|assistants?"
    r"|packers?|pickers?|stockers?|movers?|porters?"
)
_OPENINGS = re.compile(
    rf"\b(?P<count>\d{{1,3}}|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|couple of|a few)\s+"
    rf"(?:(?:new|more|extra|part[- ]time|full[- ]time|good|reliable|kitchen|line|prep|delivery|warehouse|front of house)\s+)*"
    rf"(?:{_PEOPLE})\b",
    _I,
)

# The work a role is, and the plain title for it. Longest first, so "line cook" wins over "cook".
ROLES: tuple[tuple[str, str], ...] = (
    ("kitchen assistant", "Kitchen Assistant"),
    ("kitchen porter", "Kitchen Porter"),
    ("line cook", "Line Cook"),
    ("prep cook", "Prep Cook"),
    ("delivery driver", "Delivery Driver"),
    ("sales associate", "Sales Associate"),
    ("retail associate", "Retail Associate"),
    ("warehouse associate", "Warehouse Associate"),
    ("warehouse worker", "Warehouse Associate"),
    ("front desk", "Front Desk Associate"),
    ("cashier", "Cashier"),
    ("barista", "Barista"),
    ("dishwasher", "Dishwasher"),
    ("bartender", "Bartender"),
    ("waiter", "Server"),
    ("waitress", "Server"),
    ("server", "Server"),
    ("host", "Host"),
    ("cook", "Cook"),
    ("chef", "Chef"),
    ("baker", "Baker"),
    ("driver", "Delivery Driver"),
    ("courier", "Courier"),
    ("cleaner", "Cleaner"),
    ("housekeeper", "Housekeeper"),
    ("receptionist", "Receptionist"),
    ("stocker", "Stock Associate"),
    ("packer", "Packer"),
    ("picker", "Picker"),
    ("mover", "Mover"),
)
# When only the work is described: "kitchen experience" is a kitchen job. Shown as a suggestion.
WORK_TITLES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bkitchen\b", _I), "Kitchen Assistant"),
    (re.compile(r"\b(warehouse|forklift)\b", _I), "Warehouse Associate"),
    (re.compile(r"\b(deliver\w*|driving)\b", _I), "Delivery Driver"),
    (re.compile(r"\b(clean\w*|janitorial)\b", _I), "Cleaner"),
    (re.compile(r"\b(coffee|espresso)\b", _I), "Barista"),
    (re.compile(r"\b(till|register|checkout|point of sale)\b", _I), "Cashier"),
    (re.compile(r"\b(retail|shop floor|store)\b", _I), "Retail Associate"),
)
_ROLE = re.compile(r"\b(?P<role>" + "|".join(re.escape(word) for word, _ in ROLES) + r")s?\b", _I)
# Any other job named the usual way: "a dental assistant", "a pharmacy technician", "two night clerks".
_NAMED_ROLE = re.compile(
    r"\b(?P<role>(?:(?!(?:a|an|the|my|our|new|more|extra|some|good|reliable|time)\b)[a-z]+\s+)?"
    r"(?:assistant|associate|technician|attendant|clerk|coordinator|supervisor|specialist|nurse|caregiver|nanny"
    r"|tutor|mechanic|electrician|plumber|carpenter|painter|landscaper|gardener|groomer|stylist|barber|guard))s?\b",
    _I,
)

_JOB_REQUEST = re.compile(
    r"\b(post|create|open|list|advertise|put up|add)\b.{0,40}\b(job|position|role|opening|vacanc\w+|listing|ad)\b"
    rf"|(?:\b(?:I|we)\s*(?:'m|am|'re|are)?\s*|^\s*)(?:need|want|looking for|hiring|need to hire|want to hire)\b"
    rf".{{0,40}}\b({_PEOPLE}|someone|" + "|".join(re.escape(word) for word, _ in ROLES) + r")\b"
    r"|\b(we're|we are|i'm|i am)\s+hiring\b|\bhire\s+(?:a|an|\d+|one|two|three|four|five|some)\b",
    _I,
)
# A search or a question about applicants is never a new job: "I need to see who applied", "Who is free
# Friday?". "A cook who can work weekends" still is one.
_NOT_A_JOB = re.compile(
    r"\b(applied|applicants?|candidates?|phone numbers?|show me|see\b|message|ask (them|these|those))|^\s*who\b",
    _I,
)

# "should have kitchen experience", "with customer service experience", "must have a driver's license".
_REQUIREMENT = re.compile(
    r"\b(?:should|must|need to|needs to|has to|have to)\s+(?:have|has|bring)\s+(?P<a>[^.,;!?]+?)(?=\s+and\s+(?:be|can|should|must)\b|[.,;!?]|$)"
    r"|\b(?:with|need(?:s|ing)?|requires?|requiring)\s+(?P<b>(?:some\s+|previous\s+|prior\s+)?[a-z][a-z'\- ]{1,40}?\s+experience)\b"
    r"|\b(?P<c>(?:some\s+|previous\s+|prior\s+)?[a-z][a-z'\- ]{1,40}?\s+experience)\s+(?:is\s+)?(?:required|needed|a must|preferred)\b",
    _I,
)

# Asking for applicants' numbers: "Show me their phone numbers", "What's Maria's number?", "How do I call
# them?". Not "the numbers for the role" (how many), and not "give them my number" or "text them to ask…",
# which are messages.
_THEIR_NUMBERS = (
    r"(?:phone numbers?|(?:their|these|those|his|her|[A-Z][\w'\-]*'s) (?:phone )?numbers?"
    r"|contact (?:details|info\w*|numbers?))"
)
_CONTACTS = re.compile(
    rf"\b(?:show|give|get|send|share|list|see|need|want|what(?:'s| is| are)|find|search|look up)\b[^.?!]{{0,40}}?"
    rf"\b{_THEIR_NUMBERS}\b"
    r"|\bhow (?:do|can) i (?:call|reach|contact)\b|\b(?:call|ring) (?:them|these|those)\b",
    _I,
)
_MY_NUMBER = re.compile(r"\b(?:my|our) (?:phone |cell |mobile )?numbers?\b", _I)
_ONLINE = re.compile(
    r"\b(search|look (?:it |them |him |her )?up|google|find)\b.{0,50}\b(online|internet|on the web|web|facebook|instagram|"
    r"linkedin|social media)\b|\b(online|internet)\b.{0,30}\b(phone|number|contact)",
    _I,
)
_POSSESSIVE = re.compile(r"\b(?P<name>[A-Z][a-zà-ÿ'\-]+(?:\s+[A-Z][a-zà-ÿ'\-]+)?)'s\s+(?:phone|number|contact)")
# A request's first word is capitalized too: "Get Maria's number" is about Maria.
_LEADING_VERB = re.compile(r"^(?:get|give|send|show|share|find|text|call|email|tell|list|what|whats)\s+", _I)
# "Ask these three if they can come Tuesday between 2 and 5", "ask them if they can interview Tuesday afternoon".
_MEET = re.compile(
    r"\b(ask|see|check|find out)\b.{0,40}\b(if|whether)\b.{0,40}\b(can|could|are able to|would|available to)\b.{0,20}"
    r"\b(come in|come|interview|meet|stop by|drop by|pop in|chat)\b",
    _I,
)
_AVAILABILITY = re.compile(r"\b(available|availability|can work|free to work|free on|work on)\b", _I)

# What a request already read as one of these stays that, whatever else it mentions.
KEEP_ACTIONS = frozenset(
    {"search_candidates", "select_candidates", "draft_outreach", "schedule_interviews", "update_job"}
)

ONLINE_REFUSAL = (
    "I only share the contact details applicants gave you when they applied. I don't search the internet or anywhere "
    "else for anyone's phone number."
)


def days(text: str) -> list[Weekday]:
    """The days said, Monday first: "Friday and Saturday", "Fri + Sat", "weekends", "weekdays", "every day".
    Days said not to work ("but not Sundays") are left out."""
    found: set[Weekday] = set(Weekday) if _EVERY_DAY.search(text) else set()
    for match in _DAY.finditer(text):
        word = match.group("day").lower()
        found.update(_DAY_WORDS.get(word) or _DAY_WORDS[word.rstrip("s")])
    excluded = rules.excluded_days(text)
    return [day for day in Weekday if day in found and day.value not in excluded]


def pay(text: str) -> str | None:
    """The pay as the owner said it, written plainly: "$18/hour", "£11.50/hour", "$600/week", "$15–$18/hour",
    "$18"."""
    for match in _PAY.finditer(text):
        if match.group("bare"):
            return f"${match.group('bare')}/{_PERIODS[match.group('bare_period').lower()]}"
        period = match.group("period") or match.group("ly")
        if period is None and not _PAY_WORDS.search(text):
            continue  # a number with a currency sign isn't pay unless the request is about pay
        symbol = match.group("symbol")
        amount = f"{symbol}{match.group('amount')}"
        if match.group("high"):
            amount += f"–{symbol}{match.group('high')}"
        return f"{amount}/{_PERIODS[period.lower()]}" if period else amount
    return None


def shift(text: str) -> str | None:
    if not _SHIFT_CONTEXT.search(text):
        return None
    return next((name for pattern, name in _SHIFTS if pattern.search(text)), None)


def openings(text: str) -> int | None:
    """How many people, when said: "two workers", "3 cashiers", "a couple of servers". "a cashier" is one."""
    match = _OPENINGS.search(text)
    if match is None:
        return None
    said = match.group("count").lower()
    count = _NUMBERS.get(said) or (int(said) if said.isdigit() else None)
    return count if count and 1 <= count <= 500 else None


def requirements(text: str) -> list[str]:
    """What applicants should bring, as said: "Kitchen experience", "Customer service experience". Never a
    personal characteristic."""
    found: list[str] = []
    for match in _REQUIREMENT.finditer(text):
        said = (match.group("a") or match.group("b") or match.group("c") or "").strip()
        said = re.sub(r"^(?:some|previous|prior|a|an|the|good|great|solid)\s+", "", said, flags=_I)
        parts = re.split(r"\s+and\s+|,\s*", said)
        for part in parts:
            part = part.strip(" .")
            if not 2 < len(part) <= 60 or personal_characteristics.mentions(part):
                continue
            if _DAY.fullmatch(part) or re.match(r"^(be|available|able)\b", part, _I):
                continue
            found.append(part[0].upper() + part[1:])
    return list(dict.fromkeys(found))


def title(text: str, needs: list[str]) -> tuple[str | None, bool]:
    """The job's title and whether it's only a suggestion: the role said ("a cashier job", "two baristas"),
    else the plain title for the work described ("kitchen experience" is a Kitchen Assistant)."""
    role = _ROLE.search(text)
    if role:
        word = role.group("role").lower()
        return next(name for key, name in ROLES if key == word), False
    named = _NAMED_ROLE.search(text)
    if named and not _generic(named.group("role")):
        return named.group("role").title(), False
    described = " ".join([text, *needs])
    for pattern, name in WORK_TITLES:
        if pattern.search(described):
            return name, True
    return None, False


def is_job_request(text: str) -> bool:
    return bool(_JOB_REQUEST.search(text)) and not _NOT_A_JOB.search(text)


def job_changes(text: str, said: JobChanges | None = None) -> tuple[JobChanges, bool]:
    """A small business's job from what the owner said, filling in what the reader before missed. Returns it
    and whether the title is a suggestion."""
    said = said or JobChanges()
    needs = list(dict.fromkeys([*said.skills_add, *requirements(text)]))
    suggested = False
    name = said.title if said.title and not _generic(said.title) else None
    if name is None:
        name, suggested = title(text, needs)
    else:  # read before, by the model or from the work described: a suggestion unless the owner said it
        suggested = name.casefold() not in text.casefold()
    return (
        said.model_copy(
            update={
                "title": name,
                "pay": said.pay or pay(text),
                "shift": said.shift or shift(text),
                "work_days": said.work_days or days(text),
                "openings": said.openings or openings(text),
                "skills_add": needs,
                "notes": said.notes or text[:1000],
            }
        ),
        suggested,
    )


def asks_for_contacts(text: str) -> bool:
    return bool(_CONTACTS.search(text)) and not _MY_NUMBER.search(text)


def asks_online_lookup(text: str) -> bool:
    return asks_for_contacts(text) and bool(_ONLINE.search(text))


def refine(intent: AssistantIntent, text: str, *, has_selection: bool, proposal_kind: str | None) -> AssistantIntent:
    """The intent the model or the rules read, with Simple Hire's everyday phrasing read the same way every
    time: a job described in plain words, an availability filter, a request for phone numbers, and asking
    applicants to come in on a day."""
    text = text.replace("’", "'")
    if intent.action in ("confirm", "cancel"):
        return intent
    if proposal_kind == "job" and intent.action == "update_job":
        # "Make it $19 an hour", "change the days to Saturday and Sunday": the draft's facts, as said.
        job = intent.job or JobChanges()
        facts = {
            "pay": job.pay or pay(text),
            "shift": job.shift or shift(text),
            "work_days": job.work_days or days(text),
            "openings": job.openings or openings(text),
        }
        return intent.model_copy(update={"job": job.model_copy(update=facts)})
    if asks_for_contacts(text):
        names = [_LEADING_VERB.sub("", match.group("name")) for match in _POSSESSIVE.finditer(text)]
        names = names or intent.candidate_names
        if not names and intent.candidate_name:
            names = [intent.candidate_name]
        return AssistantIntent(action="show_contacts", candidate_names=names, instructions=text[:1000])
    if (has_selection or intent.candidate_names) and _MEET.search(text) and rules.interview_details(text).timeframe:
        details = rules.interview_details(text)
        start, end = window_from_text(text)
        return intent.model_copy(
            update={
                "action": "schedule_interviews",
                "instructions": text[:1000],
                "interview": details,
                "schedule": ScheduleDetails(**details.model_dump(), window_start=start, window_end=end),
            }
        )
    # A job described in plain words is a job, even when the reader took it for a search: "I need someone to
    # help in the kitchen on Fridays, $18 an hour" names no applicant, no one who applied.
    described = is_job_request(text) and (intent.action not in KEEP_ACTIONS or intent.action == "search_candidates")
    if intent.action == "create_job" or described:
        changes, _ = job_changes(text, intent.job)
        return intent.model_copy(update={"action": "create_job", "job": changes})
    if intent.action == "search_candidates":
        update: dict[str, object] = {"skills": _experience_criteria(intent.skills, text)}
        if _AVAILABILITY.search(text) and not intent.available_days:
            update["available_days"] = days(text)
        return intent.model_copy(update=update)
    return intent


def _experience_criteria(skills: list[str], text: str) -> list[str]:
    """ "with kitchen experience" is the criterion "Kitchen experience", as said, not just "Kitchen"."""
    lowered = text.lower()
    criteria = []
    for skill in skills:
        if not skill.lower().endswith("experience") and f"{skill.lower()} experience" in lowered:
            skill = f"{skill} experience"
        criteria.append(skill)
    return criteria


# Words for people that aren't a job: "two workers", "kitchen staff", "some help". A bare "Assistant" or
# "Associate" says no more; "Medical Assistant" and "Store Associate" are real titles.
_GENERIC = re.compile(
    r"(?:\w+\s+)?(?:workers?|people|staff|employees|hires|hands|helpers?|team members?|someone|help)"
    r"|assistants?|associates?|porters?",
    _I,
)


def _generic(said: str) -> bool:
    """ "Workers", "people", "staff": not a title."""
    return bool(_GENERIC.fullmatch(said.strip()))


# Simple Hire's words for the assistant's answers: what happened, plainly, with no recruiting terms.

HELP = (
    "I can post a job, show you who applied, give you their phone numbers, message them, or ask them to come in "
    "for an interview. Try:\n"
    '- **"Post a cashier job paying $16 an hour for weekend shifts."** You see it before it\'s posted.\n'
    '- **"Show me people who applied for the kitchen job."**\n'
    '- **"Show me 3 applicants with kitchen experience who are available Friday and Saturday."** Then tick the '
    "people you'd like to contact.\n"
    '- **"Show me their phone numbers."**, **"Message these three."** or **"Ask them if they can come in Tuesday '
    'between 2 and 5."** Nothing is sent until you press Send.'
)


# The recruiting team's words in answers both workspaces share, and Simple Hire's for them. Examples name no
# one: the recruiting team's name their own demo candidates, who aren't anyone a small business knows.
PLAIN_WORDS: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern), plain)
    for pattern, plain in (
        (
            (
                r'Tick the candidates first, in the list or on the Candidates page, or say who: "Select Sophia, Maya '
                r'and James"\.'
            ),
            "Tick the people first, in the list, or say who by name.",
        ),
        (
            r'Who should I select\? Say their names, like "Select Sophia and Maya"\.',
            "Who do you mean? Say their names.",
        ),
        (
            r"Which candidate\? Say their name, for example \"Tell me about Sophia's application\"\.",
            "Who do you mean? Say their name.",
        ),
        (
            r'"Make them Thursday afternoon" or "Leave James out"',
            '"Make them Thursday afternoon" or "Leave one of them out"',
        ),
        (r"in your active pipeline", "among the people who applied"),
        (r"Check the name, or open the candidate's page\.", "Check the name, or look in Applicants."),
        (
            r" isn't in the active pipeline\. Restore them before messaging them\.",
            "'s application is closed, so I can't message them.",
        ),
        (r"candidate portal messages", "TalentBridge messages"),
        (r" Turned on candidate messaging so (\S+) can reply\.", r" \1 can reply, and you'll see it in Messages."),
        (r" Candidate messaging will be turned on so (\S+) can reply\.", r" \1 will be able to reply."),
        (r" (\S+) can't reply in the portal: candidate messaging (?:is|stays) off\.", r" \1 can't reply to it."),
        (r"Check the message, then confirm\.", "Check the message, then press Send."),
        (r"Confirm to send it\.", "Press Send to send it."),
    )
)


def plainly(reply: str) -> str:
    """A shared answer in Simple Hire's words."""
    for pattern, plain in PLAIN_WORDS:
        reply = pattern.sub(plain, reply)
    return reply


def plain_reply(cards: list[AssistantCard], reply: str) -> str:
    """The reply a Simple Hire owner reads with these cards. Answers with no plainer form keep their own."""
    for card in cards:
        if isinstance(card, CandidateMatchCard):
            return _people(card)
        if isinstance(card, OutreachCard):
            return _sent(card) if card.stage == "done" else _to_send(card)
    return reply


def _people(card: CandidateMatchCard) -> str:
    """Who's in the list, claiming no more than every one of them shows."""
    shown = len(card.items)
    if not shown:
        return "Nobody who applied fits that yet. Try asking for less, or look again when more people have applied."
    verb = "is" if shown == 1 else "are"
    people = f"{shown} {'person' if shown == 1 else 'people'}"
    if card.matching > shown:
        people = f"{shown} of the {card.matching} people"
    tick = "Tick the people you'd like to contact."
    asked = _join([criterion[:1].lower() + criterion[1:] for criterion in card.criteria]) if card.criteria else ""
    days = _join([day.label for day in card.available_days]) if card.available_days else ""
    if not asked and not days:
        return f"Here {verb} {people} who applied. {tick}"
    if card.criteria_source == "job_requirements" and not days:
        return f"Here {verb} {people} who applied. Each one shows whether they have {asked}, as the job asks. {tick}"
    if all(item.matched == len(item.evidence) for item in card.items):
        lead = f"Here {verb} {people} who applied" + (f" with {asked}" if asked else "")
        if days:
            lead += f"{' and' if asked else ','} who can work {days}"
        return f"{lead}. Each one shows why. {tick}"
    looked = " and ".join(part for part in (asked, f"people who can work {days}" if days else "") if part)
    return f"Here {verb} {people} who applied. I looked for {looked}: each one shows what they have and what they don't. {tick}"


def _to_send(card: OutreachCard) -> str:
    check = "Read them and change anything you like. Nothing is sent until you press Send."
    if card.schedule is None:
        return f"Here's a message for each of them. {check}"
    when = f" between {_clock(card.schedule.window_start)} and {_clock(card.schedule.window_end)}"
    if card.schedule.day:
        when = f" on {_day(card.schedule.day)}{when}"
    included = [item for item in card.items if item.include]
    timed = [item for item in included if item.slot]
    untimed = [item for item in included if not item.slot]
    if not untimed:
        return f"Here's an interview request for each of them{when}, each with its own time. {check}"
    asks = "their messages ask" if len(untimed) > 1 else "the message asks"
    if not timed:
        return f"Here's an interview request for each of them{when}. None fit in that time, so each message asks when they can come instead. {check}"
    return (
        f"Here's an interview request for each of them{when}. {_names(timed)} {'each have' if len(timed) > 1 else 'has'} "
        f"a time. There wasn't room in that window for {_names(untimed)}, so {asks} when they can come instead. {check}"
    )


def _sent(card: OutreachCard) -> str:
    done = [item for item in card.items if item.result and item.result.message_sent]
    failed = [item for item in card.items if item.result and not item.result.message_sent]
    lines = [f"Sent to {_join([item.candidate.name.split()[0] for item in done])}." if done else "Nothing was sent."]
    booked = [item for item in done if item.result and item.result.interview_created]
    unbooked = [item for item in done if not (item.result and item.result.interview_created)]
    if booked:
        whose = "Their interviews are" if not unbooked else f"Interviews for {_names(booked)} are"
        calendar = all(item.result and item.result.calendar == "created" for item in booked)
        lines.append(
            f"{whose} booked, and calendar invitations went out."
            if calendar
            else f"{whose} booked in TalentBridge. No calendar is connected, so no calendar invitations were sent."
        )
    if card.schedule is not None and unbooked:
        asks = "their messages ask" if len(unbooked) > 1 else "the message asks"
        lines.append(f"No interview is booked for {_names(unbooked)}: {asks} when they can come.")
    if done:
        lines.append("They can reply, and you'll see it in Messages.")
    lines += [f"Couldn't send to {item.candidate.name}: {item.result.error}" for item in failed if item.result]
    return " ".join(lines)


def _names(items: list[OutreachItem]) -> str:
    return _join([item.candidate.name.split()[0] for item in items])


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def _clock(time: str) -> str:
    hours, minutes = (int(part) for part in time.split(":"))
    hour = hours % 12 or 12
    suffix = "PM" if hours >= 12 else "AM"
    return f"{hour}:{minutes:02d} {suffix}" if minutes else f"{hour} {suffix}"


def _day(iso: str) -> str:
    try:
        day = date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{day:%A}, {day:%B} {day.day}"
