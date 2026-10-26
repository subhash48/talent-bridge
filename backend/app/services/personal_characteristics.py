"""Personal characteristics: never searched for, matched on, asked about or written into a message about a
candidate, by the assistant or the shortlist. Only job-related criteria are ever used: skills, requirements,
the job, the stage, a location, interview progress, communication.

The words are chosen so job-related ones still pass: languages ("Spanish", "Mandarin") are skills, "over 10
years of experience" is experience, and "under 30 minutes" is a length.
"""

import re

SENSITIVE = re.compile(
    # Race and ethnicity
    r"\b(race|racial|ethnicit\w*|ethnic|hispanic|latin[oax]s?|asian|black|white|middle eastern|african american"
    r"|caucasian|arab|indigenous|native american|pacific islander"
    # Disability and health
    r"|disabilit\w*|disabled|handicap\w*|wheelchair|deaf|medical condition|health condition|chronic illness"
    # Sexual orientation and gender
    r"|sexual\w*|gay|lesbian|bisexual|queer|asexual|heterosexual|lgbt\w*|transgender|non[- ]?binary|gender\w*"
    r"|female|male|women|men|woman|man|girls?|boys?"
    # Age
    r"|age[ds]?|\d{1,3}[- ]?years?[- ]old|elderly|millennials?|gen[- ]?z|boomers?"
    r"|(?:younger|older) (?:candidates|applicants|people|ones|talent|workers)"
    # Religion
    r"|religio\w*|christian\w*|muslim\w*|islam\w*|jewish|judaism|hindu\w*|buddhis\w*|sikh\w*|catholic\w*"
    r"|protestant\w*|atheis\w*"
    # National origin
    r"|nationalit\w*|national origin|immigrants?|foreign[- ]born|native[- ]born|native speakers?"
    # Family
    r"|pregnan\w*|maternity|paternity|parental|marital|married|divorced|widowed|single (?:mother|father|parent)s?"
    r"|(?:has|have|with|without|no) (?:kids|children)|childless"
    # Military status
    r"|veteran status|military status)\b"
    # "under 30", "over 50": ages, unless it's years (of experience), a length or an amount
    r"|\b(?:under|over|below|above|younger than|older than)\s+\d{2}\b(?!\s*(?:\+\s*)?(?:minutes?|mins?|hours?|hrs?"
    r"|days?|weeks?|months?|years?|yrs?|k\b|%|candidates|applicants|people))",
    re.IGNORECASE,
)

REFUSAL = (
    "I can't look up, filter, match or write about anyone's race, ethnicity, gender, age, religion, nationality, "
    "disability, sexual orientation, family status or any other personal characteristic, and they're never used in "
    "hiring decisions. I can match on job-related criteria: skills, requirements, the job, the stage or a location."
)


def mentions(text: str | None) -> bool:
    return bool(text) and SENSITIVE.search(text) is not None
