"""Workspaces: one employer's hiring data is never another's.

A company is a workspace (migration 019). Recruiters and admins hire for one company (users.company_id),
and every request to the recruiter API is scoped to it: core/dependencies.require_workspace calls
scope_to() on the request's database session before the route runs. From then on, every ORM query in
that session sees only the workspace's own rows, however it's written:

    jobs           the company's own
    applications   to those jobs
    candidates     people with an application to one of them (one person can apply to several
                   employers; each sees only its own applications and what the candidate shared there)
    everything kept per application: messages and their delivery, interviews, timeline, stage history,
    drafts, résumés sent with an application, portal sessions
    companies      only its own

A row of another workspace isn't there: a list leaves it out and an id answers 404, exactly as if it
didn't exist, so nothing says it does. The filter is added to the statement itself (with_loader_criteria),
including the relationship loads it starts, so code written without workspaces in mind is scoped too.

Only reads are filtered. Writes go through rows the scoped session loaded, and the routes that take an id
check it first (core/dependencies own_*). A lookup that must see across workspaces says so in the
statement: .execution_options(all_workspaces=True). That is for checks that reveal nothing about another
employer, such as whether an email already has a candidate account.

The candidate portal and the public careers site are never scoped: a candidate sees their own record,
across every employer they applied to, and nothing of anyone else's.
"""

import uuid

from sqlalchemy import and_, event, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria
from sqlalchemy.sql.base import ExecutableOption

from app.models import (
    AIAnalysis,
    Application,
    AssistantAction,
    Candidate,
    CandidateActivity,
    CandidateDemographics,
    CandidateEngagementEvent,
    CandidateResume,
    CandidateStageHistory,
    CommunicationDraft,
    Company,
    DemoApplication,
    DemoJobPosting,
    DemoResume,
    Interview,
    Job,
    Message,
    MessageDelivery,
    PortalSession,
    User,
)

SCOPE = "workspace_company_id"
ALL_WORKSPACES = "all_workspaces"

# Plain tables, not the mapped classes: a filter written with the classes would be filtered again itself.
_jobs = Job.__table__
_applications = Application.__table__
_messages = Message.__table__
_demo_applications = DemoApplication.__table__
_users = User.__table__
# Every table kept per application (an application_id column), filtered the same way.
PER_APPLICATION = (
    Message,
    Interview,
    CandidateActivity,
    CandidateStageHistory,
    CommunicationDraft,
    AIAnalysis,
    PortalSession,
)


def scope_to(session: AsyncSession | Session, company_id: uuid.UUID) -> None:
    """Show this session only one workspace's rows, for the rest of its life."""
    session.info[SCOPE] = company_id


def scoped_company(session: AsyncSession | Session) -> uuid.UUID | None:
    """The workspace a session is scoped to, or None for an unscoped one (the portal, the careers site)."""
    value = session.info.get(SCOPE)
    return value if isinstance(value, uuid.UUID) else None


def criteria(company_id: uuid.UUID) -> list[ExecutableOption]:
    """The filters for one workspace: what each table may show."""
    job_ids = select(_jobs.c.id).where(_jobs.c.company_id == company_id)
    application_ids = select(_applications.c.id).where(_applications.c.job_id.in_(job_ids))
    candidate_ids = select(_applications.c.candidate_id).where(_applications.c.job_id.in_(job_ids))
    message_ids = select(_messages.c.id).where(_messages.c.application_id.in_(application_ids))
    demo_application_ids = select(_demo_applications.c.id).where(_demo_applications.c.job_id.in_(job_ids))
    staff_ids = select(_users.c.id).where(_users.c.company_id == company_id)
    options: list[ExecutableOption] = [
        with_loader_criteria(Company, Company.id == company_id, include_aliases=True),
        with_loader_criteria(Job, Job.company_id == company_id, include_aliases=True),
        with_loader_criteria(Application, Application.job_id.in_(job_ids), include_aliases=True),
        with_loader_criteria(Candidate, Candidate.id.in_(candidate_ids), include_aliases=True),
        with_loader_criteria(MessageDelivery, MessageDelivery.message_id.in_(message_ids), include_aliases=True),
        # A résumé sent with an application is that employer's; one on the person alone (added by hand
        # before résumés were kept per application) goes with the candidate.
        with_loader_criteria(
            CandidateResume,
            or_(
                CandidateResume.application_id.in_(application_ids),
                and_(CandidateResume.application_id.is_(None), CandidateResume.candidate_id.in_(candidate_ids)),
            ),
            include_aliases=True,
        ),
        with_loader_criteria(
            CandidateEngagementEvent,
            or_(
                CandidateEngagementEvent.application_id.in_(application_ids),
                and_(
                    CandidateEngagementEvent.application_id.is_(None),
                    CandidateEngagementEvent.candidate_id.in_(candidate_ids),
                ),
            ),
            include_aliases=True,
        ),
        with_loader_criteria(CandidateDemographics, CandidateDemographics.candidate_id.in_(candidate_ids)),
        with_loader_criteria(AssistantAction, AssistantAction.recruiter_id.in_(staff_ids)),
        with_loader_criteria(DemoJobPosting, DemoJobPosting.job_id.in_(job_ids)),
        with_loader_criteria(DemoApplication, DemoApplication.job_id.in_(job_ids)),
        with_loader_criteria(DemoResume, DemoResume.demo_application_id.in_(demo_application_ids)),
    ]
    options += [
        with_loader_criteria(model, model.application_id.in_(application_ids), include_aliases=True)
        for model in PER_APPLICATION
    ]
    return options


@event.listens_for(Session, "do_orm_execute")
def _only_this_workspace(state: ORMExecuteState) -> None:
    company_id = scoped_company(state.session)
    if company_id is None or state.execution_options.get(ALL_WORKSPACES):
        return
    # Relationship and column loads inherit the filters of the statement that loaded their parents.
    if state.is_select and not state.is_column_load and not state.is_relationship_load:
        state.statement = state.statement.options(*criteria(company_id))
