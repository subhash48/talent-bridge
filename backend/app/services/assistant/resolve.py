"""Who and what a request is about: names and titles as the recruiter said them, matched to records.

It never guesses. A name that matches nobody in the active pipeline says so; a name that matches
several people (or one person in several jobs) comes back as all of them, for the recruiter to choose.
A name spelled as it sounds ("Sofia" for Sophia, as speech transcription often writes it) matches by
sound only when nothing matches exactly, and the match is flagged so the reply says how it was read.
Only names, job titles and stages are compared: nothing about engagement, demographics or anything
else a person could be judged by.
"""

import re
import unicodedata
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.models import Application, Candidate, DemoJobPosting, Job

# Words a request uses for "the candidate we were talking about".
PRONOUNS = re.compile(r"\b(her|him|them|they|she|he|their|his)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Resolution:
    matches: list[Application]
    name: str | None  # what was searched for, as said
    approximate: bool = False  # matched by sound, not spelling

    @property
    def one(self) -> Application | None:
        return self.matches[0] if len(self.matches) == 1 else None


def normalize(text: str) -> str:
    """Lowercase, accents removed, so "Rene" finds "René"."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


async def active_applications(session: AsyncSession) -> list[Application]:
    """The active pipeline (archived applications left out), with each candidate and job."""
    rows = await session.scalars(
        select(Application)
        .join(Application.candidate)
        .join(Application.job)
        .options(contains_eager(Application.candidate), contains_eager(Application.job))
        .where(Application.archived_at.is_(None))
        .order_by(Candidate.first_name, Candidate.last_name, Job.title)
    )
    return list(rows.unique())


async def resolve_candidate(
    session: AsyncSession,
    *,
    name: str | None,
    text: str,
    job_title: str | None = None,
    context_application_id: uuid.UUID | None = None,
) -> Resolution:
    """The applications a request means. With no name, the candidate in context when the request
    refers back to them ("send her the invite"), else any active candidate's name in the words."""
    applications = await active_applications(session)
    approximate = False
    if name:
        matches = [app for app in applications if _matches_name(app.candidate, name)]
        # A name heard or read wrongly: whoever the words do name, if anyone; else whoever it sounds like.
        matches = matches or _mentioned(applications, text)
        if not matches:
            matches = [app for app in applications if _sounds_like(app.candidate, name)]
            approximate = bool(matches)
    else:
        matches = _mentioned(applications, text)
        if not matches and context_application_id is not None and (PRONOUNS.search(text) or not _has_name(text)):
            matches = [app for app in applications if app.id == context_application_id]
    if job_title and len(matches) > 1:
        narrowed = [app for app in matches if _title_matches(app.job.title, job_title)]
        matches = narrowed or matches
    if context_application_id is not None and len(matches) > 1:
        chosen = [app for app in matches if app.id == context_application_id]
        matches = chosen or matches
    return Resolution(matches=matches, name=name, approximate=approximate)


async def find_jobs(session: AsyncSession, title: str) -> list[Job]:
    """Jobs whose title has every word said, newest first."""
    rows = await session.scalars(select(Job).order_by(Job.created_at.desc()))
    return [job for job in rows if _title_matches(job.title, title)]


async def find_demo_job(session: AsyncSession, title: str | None, job_id: uuid.UUID | None) -> DemoJobPosting | None:
    """The demo job a request means: the one in context, else the newest whose title matches."""
    if job_id is not None and title is None:
        return await session.get(DemoJobPosting, job_id)
    if title:
        postings = await session.scalars(select(DemoJobPosting).order_by(DemoJobPosting.created_at.desc()))
        for posting in postings:
            if _title_matches(posting.job.title, title):
                return posting
        return None
    return await session.get(DemoJobPosting, job_id) if job_id else None


def _matches_name(candidate: Candidate, name: str) -> bool:
    said = normalize(name).replace("'s", "").split()
    first, last = normalize(candidate.first_name), normalize(candidate.last_name)
    full = f"{first} {last}".split()
    return bool(said) and all(word in full for word in said)


def soundex(word: str) -> str:
    """American Soundex: names that sound alike share a code (Sophia and Sofia are both S100)."""
    letters = [character for character in normalize(word) if character.isalpha()]
    if not letters:
        return ""
    codes = {**dict.fromkeys("bfpv", "1"), **dict.fromkeys("cgjkqsxz", "2"), **dict.fromkeys("dt", "3"), "l": "4"}
    codes.update(dict.fromkeys("mn", "5"))
    codes["r"] = "6"
    result, previous = letters[0].upper(), codes.get(letters[0], "")
    for character in letters[1:]:
        code = codes.get(character, "")
        if code and code != previous:
            result += code
        if character not in "hw":
            previous = code
    return (result + "000")[:4]


def _sounds_like(candidate: Candidate, name: str) -> bool:
    """Every word said sounds like the candidate's first or last name. Words under three letters don't count."""
    said = [word for word in normalize(name).replace("'s", "").split() if len(word) >= 3]
    names = {soundex(candidate.first_name), soundex(candidate.last_name)}
    return bool(said) and all(soundex(word) in names for word in said)


def _mentioned(applications: list[Application], text: str) -> list[Application]:
    """Applications whose candidate's full name, else first or last name, is in the text."""
    words = normalize(text)
    full = [app for app in applications if _contains(words, f"{app.candidate.first_name} {app.candidate.last_name}")]
    if full:
        return full
    return [
        app
        for app in applications
        if _contains(words, app.candidate.first_name) or _contains(words, app.candidate.last_name)
    ]


def _contains(text: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(normalize(phrase))}(?:'s)?\b", text) is not None


def _has_name(text: str) -> bool:
    """Whether the request names someone (a capitalised word that doesn't start a sentence)."""
    return re.search(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-z]+\b", text.strip()) is not None


def _title_matches(title: str, said: str) -> bool:
    words = [
        word for word in normalize(said).replace("-", " ").split() if word not in {"the", "a", "an", "role", "job"}
    ]
    have = normalize(title).replace("-", " ")
    return bool(words) and all(re.search(rf"\b{re.escape(word)}", have) for word in words)
