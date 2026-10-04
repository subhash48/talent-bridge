"""Development only: the résumés uploaded on the demo careers site, for recruiters, once the
application they came with has been submitted. Mounted by router.py behind require_demo_enabled, then
require_recruiter."""

from uuid import UUID

from fastapi import APIRouter, Response

from app.core.dependencies import SessionDep
from app.services import demo_resumes

router = APIRouter(prefix="/demo/resumes", tags=["demo"])


@router.get(
    "/{demo_application_id}",
    response_class=Response,
    summary="A demo applicant's résumé",
    responses={200: {"content": {content_type: {} for content_type in demo_resumes.EXTENSIONS}}},
)
async def resume(demo_application_id: UUID, session: SessionDep) -> Response:
    """The file as it was uploaded: a PDF, DOC or DOCX, shown in the browser. 404 until the
    application is submitted. The candidate's resume_url links here."""
    found = await demo_resumes.submitted_resume(session, demo_application_id)
    return Response(
        content=found.content,
        media_type=found.content_type,
        headers={
            "Content-Disposition": demo_resumes.content_disposition(found.file_name),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
