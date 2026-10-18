"""Résumés sent with applications on the careers site, for recruiters."""

from uuid import UUID

from fastapi import APIRouter, Response

from app.core.dependencies import SessionDep
from app.services import demo_resumes, resumes

router = APIRouter(prefix="/resumes", tags=["candidates"])


@router.get(
    "/{resume_id}",
    response_class=Response,
    summary="A résumé",
    responses={200: {"content": {content_type: {} for content_type in demo_resumes.EXTENSIONS}}},
)
async def resume(resume_id: UUID, session: SessionDep) -> Response:
    """The file as it was uploaded: a PDF, DOC or DOCX, shown in the browser. A candidate's resume_url
    links here."""
    found = await resumes.get(session, resume_id)
    return Response(
        content=found.content,
        media_type=found.content_type,
        headers={
            "Content-Disposition": demo_resumes.content_disposition(found.file_name),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
