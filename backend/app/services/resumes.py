"""Résumés sent with applications on the careers site: checked, stored privately, and read as text.

Uploads are checked exactly like the demo careers site's (services/demo_resumes.read_upload: the type
comes from the file's first bytes, never its name). Recruiters open the file; the text, read from PDF
and DOCX files, is what the candidate's interview preparation draws on, and only for that candidate.
"""

import hashlib
import io
import logging
import re
import uuid
import zipfile
from xml.etree import ElementTree

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import API_PREFIX
from app.core.errors import NotFoundError
from app.models import Application, Candidate, CandidateResume
from app.services.demo_resumes import DOCX, PDF, Resume

logger = logging.getLogger(__name__)

# A candidate's resume_url when their résumé is stored here: the prefix plus the résumé's id.
URL_PREFIX = f"{API_PREFIX}/resumes/"
MAX_TEXT = 20_000  # enough for any résumé; prep uses the start of it
_WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def read_text(resume: Resume) -> str | None:
    """The résumé's text, or None when none can be read (a scanned PDF, a DOC file, a damaged file)."""
    try:
        if resume.content_type == PDF:
            text = _pdf_text(resume.content)
        elif resume.content_type == DOCX:
            text = _docx_text(resume.content)
        else:
            return None
    except Exception:  # noqa: BLE001  (a damaged or unusual file: the application still goes through)
        logger.info("resumes.text_unreadable type=%s", resume.content_type)
        return None
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return text[:MAX_TEXT] or None


def _pdf_text(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages[:10])


def _docx_text(content: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    paragraphs = []
    for paragraph in root.iter(f"{_WORD}p"):
        paragraphs.append("".join(node.text or "" for node in paragraph.iter(f"{_WORD}t")))
    return "\n".join(paragraphs)


async def store(
    session: AsyncSession, candidate: Candidate, application: Application | None, resume: Resume
) -> CandidateResume:
    """Keep the résumé and make it the candidate's. Flushes."""
    row = CandidateResume(
        id=uuid.uuid4(),
        candidate_id=candidate.id,
        application_id=application.id if application else None,
        file_name=resume.file_name,
        content_type=resume.content_type,
        size_bytes=len(resume.content),
        sha256=hashlib.sha256(resume.content).hexdigest(),
        content=resume.content,
        text=read_text(resume),
    )
    session.add(row)
    candidate.resume_url = f"{URL_PREFIX}{row.id}"
    await session.flush()
    return row


async def get(session: AsyncSession, resume_id: uuid.UUID) -> Resume:
    row = await session.get(CandidateResume, resume_id)
    if row is None:
        raise NotFoundError("Résumé not found.")
    return Resume(content=row.content, content_type=row.content_type, file_name=row.file_name)


async def latest_text(session: AsyncSession, candidate_id: uuid.UUID) -> str | None:
    """The text of the candidate's latest résumé, for their own interview preparation."""
    return await session.scalar(
        select(CandidateResume.text)
        .where(CandidateResume.candidate_id == candidate_id, CandidateResume.text.is_not(None))
        .order_by(CandidateResume.created_at.desc())
        .limit(1)
    )
