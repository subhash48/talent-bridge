"""Résumés uploaded with applications on the development-only demo careers site.

The file arrives base64-encoded in the JSON body. Its type is decided by its first bytes, never by its
name or the type the browser reports, and the name's extension must agree: PDF, DOC (an OLE2 compound
file) or DOCX (a ZIP archive holding word/document.xml). It is stored privately, in demo_resumes, and
only ever served to recruiters once the application has been submitted.
"""

import base64
import binascii
import hashlib
import io
import re
import unicodedata
import uuid
import zipfile
from dataclasses import dataclass
from urllib.parse import quote

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import API_PREFIX
from app.core.enums import DemoApplicationStatus
from app.core.errors import AppError, NotFoundError
from app.models import DemoApplication, DemoResume
from app.models.base import utcnow
from app.schemas.demo import MAX_RESUME_BYTES, ResumeUpload

PDF = "application/pdf"
DOC = "application/msword"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
EXTENSIONS = {PDF: ".pdf", DOC: ".doc", DOCX: ".docx"}
MAX_FILE_NAME = 120
# A candidate's resume_url, when their résumé is one sent here: the URL prefix plus the application's id
# (api/demo_resumes.py serves it).
URL_PREFIX = f"{API_PREFIX}/demo/resumes/"

_OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_QUOTES = "\"'`"


class InvalidResume(AppError):
    """The résumé can't be accepted. The message says what to do instead."""

    status_code = 422
    code = "invalid_resume"


@dataclass(frozen=True)
class Resume:
    content: bytes
    content_type: str
    file_name: str  # safe to store and to send back in a header


def read_upload(upload: ResumeUpload) -> Resume:
    """Decode and check an uploaded résumé. Raises InvalidResume."""
    try:
        content = base64.b64decode("".join(upload.data.split()), validate=True)
    except (binascii.Error, ValueError):
        raise InvalidResume("The résumé didn't arrive intact. Choose the file again.") from None
    if not content:
        raise InvalidResume("The résumé file is empty.")
    if len(content) > MAX_RESUME_BYTES:
        raise InvalidResume("The résumé is larger than 5 MB. Upload a smaller file.")
    content_type = _content_type(content)
    if content_type is None:
        raise InvalidResume("Upload your résumé as a PDF, DOC or DOCX file.")
    stem, extension = _split_name(upload.file_name)
    expected = EXTENSIONS[content_type]
    if extension.lower() != expected:
        raise InvalidResume(
            f"The résumé is a {expected[1:].upper()} file, but its name doesn't end in {expected}. "
            "Upload the original file."
        )
    stem = (stem or "resume")[: MAX_FILE_NAME - len(extension)].rstrip(" .")
    return Resume(content=content, content_type=content_type, file_name=stem + extension)


async def save(session: AsyncSession, application: DemoApplication, resume: Resume) -> None:
    """Attach the résumé to the application, replacing the one sent with it before. Flushes."""
    application.resume_file_name = resume.file_name
    application.resume_content_type = resume.content_type
    application.resume_size_bytes = len(resume.content)
    application.resume_sha256 = hashlib.sha256(resume.content).hexdigest()
    await session.flush()
    replaced = await session.execute(
        update(DemoResume)
        .where(DemoResume.demo_application_id == application.id)
        .values(content=resume.content, created_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if not replaced.rowcount:  # type: ignore[attr-defined]
        session.add(DemoResume(demo_application_id=application.id, content=resume.content))
        await session.flush()


async def submitted_resume(session: AsyncSession, demo_application_id: uuid.UUID) -> Resume:
    """The résumé of a submitted application. 404 while it is pending: until the applicant activates
    their account there is no candidate, and recruiters see nothing of them."""
    row = (
        await session.execute(
            select(DemoApplication.resume_file_name, DemoApplication.resume_content_type, DemoResume.content)
            .join(DemoResume, DemoResume.demo_application_id == DemoApplication.id)
            .where(
                DemoApplication.id == demo_application_id,
                DemoApplication.status == DemoApplicationStatus.SUBMITTED,
            )
        )
    ).first()
    if row is None:
        raise NotFoundError("Résumé not found.")
    return Resume(content=row.content, content_type=row.resume_content_type, file_name=row.resume_file_name)


def content_disposition(file_name: str) -> str:
    """Open in the browser under the original name: in full as RFC 5987's filename*, and as plain
    ASCII in filename for clients that don't read it."""
    stem, extension = _split_name(unicodedata.normalize("NFKD", file_name).encode("ascii", "ignore").decode())
    return f"inline; filename=\"{stem or 'resume'}{extension}\"; filename*=UTF-8''{quote(file_name, safe='')}"


def _content_type(content: bytes) -> str | None:
    if content.startswith(b"%PDF-"):
        return PDF
    if content.startswith(_OLE2):
        return DOC
    if content.startswith(b"PK\x03\x04") and _is_docx(content):
        return DOCX
    return None


def _is_docx(content: bytes) -> bool:
    """A ZIP archive with a Word document part. Only the archive's directory is read, never a member,
    and a damaged directory, an unreadable name or an impossible offset just means it isn't one."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            return "word/document.xml" in archive.namelist()
    except (zipfile.BadZipFile, NotImplementedError, ValueError, OverflowError):
        return False


def _split_name(name: str) -> tuple[str, str]:
    """The file name without its folders, control characters or quotes, as (stem, extension). The
    extension keeps its dot, or is empty."""
    name = re.split(r"[\\/]", name)[-1]
    name = "".join(
        character
        for character in name
        if character not in _QUOTES and not unicodedata.category(character).startswith("C")
    )
    name = " ".join(name.split())
    stem, dot, extension = name.rpartition(".")
    if not dot:
        return name, ""
    return stem.strip(" ."), f".{extension}"
