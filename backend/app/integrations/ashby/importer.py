"""Upserts Ashby records into Talent Bridge. Webhooks and the reconciliation sync both use this, so a
record is applied the same way whichever path delivers it, as often as it is delivered.

Identity: jobs, applications and interviews are matched by their Ashby id. A candidate is matched by
Ashby id once linked; by email only the first time (an existing Talent Bridge candidate who applies
through Ashby, or a second Ashby profile with the same email), so a later email change in Ashby never
merges or splits people.

Ordering: every record carries Ashby's updatedAt. A record older than the version already applied is
skipped, so a late webhook can't undo a newer change. State changes are compare-and-swap updates on
the state that was read, so two deliveries of the same change racing each other write its stage
history and timeline entries once.

The caller owns the transaction: nothing here commits.
"""

import logging
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import ColumnElement, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.database import insert_if_absent
from app.core.enums import ActivityType, ApplicationStage, InterviewStatus, JobStatus, PortalAccountStatus
from app.integrations.ashby import mapping
from app.integrations.ashby.client import AshbyClient, AshbyError
from app.integrations.ashby.schemas import (
    AshbyApplication,
    AshbyCandidate,
    AshbyJob,
    CandidateMerge,
    InterviewEvent,
    InterviewSchedule,
    JobRef,
)
from app.models import Application, Candidate, Interview, Job
from app.models.base import utcnow
from app.services.activity_service import record_activity
from app.services.application_service import record_stage

logger = logging.getLogger(__name__)

ORIGIN = "ashby"
MAX_ATTEMPTS = 5  # compare-and-swap retries when another delivery changed the same row first
SAME_INTERVIEW_WINDOW = timedelta(minutes=1)  # an interview scheduled here at the same time is the same one
CLOSED_TITLES = {"RejectedByCandidate": "Withdrawn by the candidate", "RejectedByOrg": "not selected"}
CLOSED_OUTCOMES = {"RejectedByCandidate": "withdrawn", "RejectedByOrg": "no_longer_considered"}


class SkipRecord(Exception):
    """This record can't be imported as it is. The message is safe to store and show."""


class NotReady(Exception):
    """This record depends on one that hasn't synced yet. Retrying later will work."""


@dataclass
class ApplicationResult:
    application_id: uuid.UUID
    candidate_id: uuid.UUID
    created: bool = False
    changed: bool = False
    stale: bool = False
    invite: bool = False  # the candidate should be invited to the portal once this commits


class AshbyImporter:
    def __init__(
        self,
        session: AsyncSession,
        *,
        client: AshbyClient | None = None,
        title_map: Mapping[str, ApplicationStage] | None = None,
        invites_enabled: bool = True,
    ) -> None:
        self.session = session
        self.client = client
        self.title_map = title_map or {}
        self.invites_enabled = invites_enabled
        self._interview_titles: dict[str, str | None] = {}

    # Jobs

    async def upsert_job(self, data: AshbyJob) -> Job:
        values: dict[str, Any] = {
            "title": data.title,
            "status": mapping.JOB_STATUSES.get(data.status or "", JobStatus.OPEN),
            "employment_type": mapping.EMPLOYMENT_TYPES.get(data.employment_type or "", "Full-time"),
            "external_updated_at": data.updated_at,
        }
        if data.location and data.location.name:
            values["location"] = data.location.name
        job = await self._job(data.id)
        if job is None:
            await insert_if_absent(self.session, Job.__table__, {"id": uuid.uuid4(), "external_id": data.id, **values})
            job = await self._job(data.id)
            assert job is not None
            return job
        if _is_older(data.updated_at, job.external_updated_at):
            return job
        _assign(job, values)
        return job

    async def job_for(self, ref: JobRef) -> Job:
        """The job an application belongs to, created from Ashby's job record when it's new here."""
        job = await self._job(ref.id)
        if job is not None:
            # A full job record (job.info, jobUpdate) is authoritative; the title in an application
            # payload only fills in for jobs that never had one.
            if job.external_updated_at is None and ref.title and job.title != ref.title:
                job.title = ref.title
            return job
        if self.client is not None:
            try:
                return await self.upsert_job(AshbyJob.model_validate(await self.client.job_info(ref.id)))
            except (AshbyError, ValidationError, KeyError) as exc:
                logger.warning("ashby.job_info_unavailable job=%s error=%s", ref.id, exc)
        await insert_if_absent(
            self.session,
            Job.__table__,
            {
                "id": uuid.uuid4(),
                "external_id": ref.id,
                "title": ref.title or "Untitled role",
                "status": JobStatus.OPEN,  # it's receiving applications
                "employment_type": "Full-time",
            },
        )
        job = await self._job(ref.id)
        assert job is not None
        return job

    # Candidates

    async def upsert_candidate(self, data: AshbyCandidate, *, version: datetime | None = None) -> Candidate:
        """The person, matched by Ashby id, else (first time only) by email.

        version is the Ashby updatedAt of the payload the candidate came in. Only full candidate
        records (candidate.list/info) carry their own, and only those advance the stored version.
        """
        email = data.email
        candidate = await self._candidate(data.id)
        if candidate is None and email:
            candidate = await self.session.scalar(select(Candidate).where(Candidate.email == email))
            if candidate is not None:
                if candidate.external_id is None:
                    candidate.external_id = data.id
                    logger.info("ashby.candidate_linked candidate=%s ashby_candidate=%s", candidate.id, data.id)
                else:
                    # A second Ashby profile with the same email: the same person, with one sign-in.
                    logger.info("ashby.duplicate_profile candidate=%s ashby_candidate=%s", candidate.id, data.id)
        if candidate is None:
            if email is None:
                raise SkipRecord("The candidate has no email address in Ashby. Add one there and they will sync.")
            first, last = data.first_and_last_name
            await insert_if_absent(
                self.session,
                Candidate.__table__,
                {
                    "id": uuid.uuid4(),
                    "external_id": data.id,
                    "external_updated_at": data.updated_at,
                    "first_name": first,
                    "last_name": last,
                    "email": email,
                    "phone": data.primary_phone_number.value if data.primary_phone_number else None,
                    "headline": data.headline,
                    "location": data.location.location_summary if data.location else None,
                    "skills": [],
                },
            )
            candidate = await self._candidate(data.id) or await self.session.scalar(
                select(Candidate).where(Candidate.email == email)
            )
            assert candidate is not None
            return candidate

        if _is_older(data.updated_at or version, candidate.external_updated_at):
            return candidate
        if data.name:
            candidate.first_name, candidate.last_name = data.first_and_last_name
        if data.primary_phone_number:
            candidate.phone = data.primary_phone_number.value
        if data.headline:
            candidate.headline = data.headline
        if data.location and data.location.location_summary:
            candidate.location = data.location.location_summary
        if data.updated_at:
            candidate.external_updated_at = data.updated_at
        if email and email != candidate.email and candidate.external_id == data.id:
            await self._change_email(candidate, email)
        return candidate

    async def _change_email(self, candidate: Candidate, email: str) -> None:
        """Follow an email change in Ashby, unless another person here already uses that address.

        The portal sign-in is unaffected: it is tied to the Supabase account, not to this address.
        """
        holder = await self.session.scalar(select(Candidate.id).where(Candidate.email == email))
        if holder is not None:
            logger.warning("ashby.email_conflict candidate=%s other=%s", candidate.id, holder)
            return
        candidate.email = email

    # Applications

    async def upsert_application(self, data: AshbyApplication, *, may_invite: bool = False) -> ApplicationResult:
        if data.candidate.email is None and await self._candidate(data.candidate.id) is None:
            raise SkipRecord("The candidate has no email address in Ashby. Add one there and they will sync.")
        job = await self.job_for(data.job)
        candidate = await self.upsert_candidate(data.candidate, version=data.updated_at)
        state = mapping.application_state(data, self.title_map, now=utcnow())

        for _ in range(MAX_ATTEMPTS):
            application = await self._application_to_update(data.id, candidate.id, job.id)
            if application is None:
                created = await self._create_application(data, candidate, job, state)
                if created is None:
                    continue  # another delivery created it first: update that one instead
                result = ApplicationResult(created.id, candidate.id, created=True, changed=True)
                break
            if _is_older(data.updated_at, application.external_updated_at):
                logger.info("ashby.stale_application application=%s", data.id)
                return ApplicationResult(application.id, candidate.id, stale=True)
            changed = await self._update_application(application, data, candidate, job, state)
            if changed is None:
                continue  # the row changed since it was read: read it again
            result = ApplicationResult(application.id, candidate.id, changed=changed)
            break
        else:
            raise NotReady(f"Application {data.id} kept changing while it was being applied.")

        if may_invite and data.status in mapping.INVITE_STATUSES:
            result.invite = self._queue_invitation(candidate)
        return result

    async def _application_to_update(self, external_id: str, candidate_id: uuid.UUID, job_id: uuid.UUID) -> Application | None:
        """The application with this Ashby id, else one made here for the same person and job."""
        application = await self.session.scalar(
            select(Application).where(Application.external_id == external_id).execution_options(populate_existing=True)
        )
        if application is not None:
            return application
        return await self.session.scalar(
            select(Application)
            .where(
                Application.candidate_id == candidate_id,
                Application.job_id == job_id,
                Application.external_id.is_(None),
            )
            .execution_options(populate_existing=True)
        )

    async def _create_application(
        self, data: AshbyApplication, candidate: Candidate, job: Job, state: mapping.ApplicationState
    ) -> Application | None:
        now = utcnow()
        stage = state.stage or ApplicationStage.SOURCED
        source = data.source.title if data.source and data.source.title else "Ashby"
        application_id = uuid.uuid4()
        inserted = await insert_if_absent(
            self.session,
            Application.__table__,
            {
                "id": application_id,
                "candidate_id": candidate.id,
                "job_id": job.id,
                "stage": stage,
                "source": source,
                "applied_at": data.created_at or now,
                "updated_at": now,
                "archived_at": state.archived_at if state.archived else None,
                **_raw_state(data, state),
            },
        )
        if not inserted:
            return None
        application = await self.session.get(Application, application_id)
        assert application is not None
        record_stage(self.session, application_id, None, stage, now)
        record_activity(
            self.session,
            application_id,
            ActivityType.APPLICATION_CREATED,
            "Application received",
            metadata={"origin": ORIGIN, "source": source, "job": job.title, "stage": stage, "ashby_id": data.id},
            at=now,
        )
        if state.archived:
            self._record_closed(application_id, state.reason_type, utcnow())  # after "received", never tied
        logger.info("ashby.application_created application=%s ashby_application=%s", application_id, data.id)
        return application

    async def _update_application(
        self,
        application: Application,
        data: AshbyApplication,
        candidate: Candidate,
        job: Job,
        state: mapping.ApplicationState,
    ) -> bool | None:
        """Apply the change. Returns whether anything visible changed, or None if the row changed
        since it was read (the caller reads it again and retries)."""
        previous_stage = application.stage
        stage = state.stage or previous_stage
        archived_at = (application.archived_at or state.archived_at) if state.archived else None
        values: dict[str, Any] = {
            **_raw_state(data, state),
            "stage": stage,
            "archived_at": archived_at,
            "candidate_id": candidate.id,
            "job_id": job.id,
        }
        if data.source and data.source.title:
            values["source"] = data.source.title
        changed = {key: value for key, value in values.items() if getattr(application, key) != value}
        if not changed:
            return False
        visible = bool(changed.keys() & {"stage", "archived_at", "job_id"})
        now = utcnow()
        if visible:
            changed["updated_at"] = now

        result = await self.session.execute(
            update(Application)
            .where(
                Application.id == application.id,
                _same(Application.stage, previous_stage),
                _same(Application.archived_at, application.archived_at),
                _same(Application.external_updated_at, application.external_updated_at),
            )
            .values(**changed)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            return None

        if stage != previous_stage:
            record_stage(self.session, application.id, previous_stage, stage, now)
            record_activity(
                self.session,
                application.id,
                ActivityType.STAGE_CHANGED,
                f"Moved to {stage.label} in Ashby",
                metadata={"from": previous_stage, "to": stage, "origin": ORIGIN, "ashby_stage": data_stage_title(data)},
                at=now,
            )
        # Each entry gets its own time (utcnow() never repeats), so the timeline order is never a tie.
        if state.archived and application.archived_at is None and stage != ApplicationStage.REJECTED:
            self._record_closed(application.id, state.reason_type, utcnow())
        elif not state.archived and application.archived_at is not None:
            record_activity(
                self.session,
                application.id,
                ActivityType.APPLICATION_RESTORED,
                "Reopened in Ashby",
                metadata={"origin": ORIGIN},
                at=utcnow(),
            )
        return visible

    def _record_closed(self, application_id: uuid.UUID, reason_type: str | None, at: datetime) -> None:
        """An archive that isn't a rejection: withdrawn, or closed for another reason."""
        record_activity(
            self.session,
            application_id,
            ActivityType.APPLICATION_CLOSED,
            f"Archived in Ashby: {CLOSED_TITLES.get(reason_type or '', 'closed')}",
            metadata={"origin": ORIGIN, "outcome": CLOSED_OUTCOMES.get(reason_type or "", "closed"), "reason_type": reason_type},
            at=at,
        )

    def _queue_invitation(self, candidate: Candidate) -> bool:
        """Mark the candidate for a portal invitation, sent once this transaction commits."""
        if not self.invites_enabled:
            return False
        if candidate.portal_status == PortalAccountStatus.NOT_REQUIRED:
            candidate.portal_status = PortalAccountStatus.PENDING_INVITATION
        return candidate.portal_status in (PortalAccountStatus.PENDING_INVITATION, PortalAccountStatus.INVITE_FAILED)

    # Interviews

    async def upsert_schedule(self, schedule: InterviewSchedule) -> int:
        """Each scheduled interview event becomes one interview. Returns how many changed."""
        application = await self.session.scalar(
            select(Application).where(Application.external_id == schedule.application_id)
        )
        if application is None and self.client is not None:
            try:
                info = AshbyApplication.model_validate(await self.client.application_info(schedule.application_id))
            except (AshbyError, ValidationError, KeyError) as exc:
                raise NotReady(f"The interview's application couldn't be fetched from Ashby: {exc}") from None
            await self.upsert_application(info)
            application = await self.session.scalar(
                select(Application).where(Application.external_id == schedule.application_id)
            )
        if application is None:
            raise NotReady("The interview's application hasn't synced from Ashby yet.")

        status = mapping.interview_status(schedule.status)
        changes = 0
        for event in schedule.interview_events:
            version = max((stamp for stamp in (event.updated_at, schedule.updated_at) if stamp), default=None)
            changes += await self._upsert_interview(application, schedule, event, status, version)

        # Events dropped from a schedule were cancelled in Ashby.
        if schedule.updated_at is not None:
            kept = {event.id for event in schedule.interview_events}
            dropped = await self.session.scalars(
                select(Interview).where(
                    Interview.external_schedule_id == schedule.id,
                    Interview.status == InterviewStatus.SCHEDULED,
                )
            )
            for interview in dropped:
                if interview.external_id not in kept and not _is_older(schedule.updated_at, interview.external_updated_at):
                    changes += await self._set_interview(
                        interview, {"status": InterviewStatus.CANCELLED, "external_updated_at": schedule.updated_at}
                    )
        return changes

    async def _upsert_interview(
        self,
        application: Application,
        schedule: InterviewSchedule,
        event: InterviewEvent,
        status: InterviewStatus,
        version: datetime | None,
    ) -> int:
        values: dict[str, Any] = {
            "title": await self._interview_title(application, schedule, event),
            "interview_type": mapping.interview_type(event),
            "scheduled_at": event.start_time,
            "duration_minutes": mapping.interview_minutes(event),
            "status": status,
            "meeting_url": mapping.meeting_url(event),
            "interviewers": [name for person in event.interviewers if (name := person.name)][:10],
            "external_schedule_id": schedule.id,
            "external_updated_at": version,
        }
        interview = await self.session.scalar(
            select(Interview).where(Interview.external_id == event.id).execution_options(populate_existing=True)
        )
        if interview is None:
            interview = await self._same_interview_scheduled_here(application.id, event.start_time)
            if interview is not None:
                values["external_id"] = event.id  # scheduled here too: adopt it rather than add another
        if interview is None:
            now = utcnow()
            interview_id = uuid.uuid4()
            inserted = await insert_if_absent(
                self.session,
                Interview.__table__,
                {
                    "id": interview_id,
                    "application_id": application.id,
                    "external_id": event.id,
                    "created_at": now,
                    "updated_at": now,
                    **values,
                },
            )
            if not inserted:
                return 0  # another delivery added it at the same moment
            if status != InterviewStatus.CANCELLED:
                record_activity(
                    self.session,
                    application.id,
                    ActivityType.INTERVIEW_SCHEDULED,
                    f"{values['title']} scheduled",
                    metadata={
                        "interview_id": interview_id,
                        "scheduled_at": event.start_time,
                        "interview_type": values["interview_type"],
                        "interviewers": values["interviewers"],
                        "origin": ORIGIN,
                    },
                    at=now,
                )
            return 1
        if _is_older(version, interview.external_updated_at):
            return 0
        return await self._set_interview(interview, values)

    async def _set_interview(self, interview: Interview, values: dict[str, Any]) -> int:
        changed = {key: value for key, value in values.items() if getattr(interview, key) != value}
        if not changed:
            return 0
        rescheduled = "scheduled_at" in changed and interview.status == InterviewStatus.SCHEDULED
        if rescheduled:
            changed["confirmed_at"] = None  # confirmed for the old time, not the new one
        now = utcnow()
        changed["updated_at"] = now
        result = await self.session.execute(
            update(Interview)
            .where(
                Interview.id == interview.id,
                _same(Interview.status, interview.status),
                _same(Interview.scheduled_at, interview.scheduled_at),
                _same(Interview.external_updated_at, interview.external_updated_at),
            )
            .values(**changed)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            return 0  # a concurrent delivery applied this or a newer version
        title = changed.get("title", interview.title)
        new_status = changed.get("status", interview.status)
        activity: tuple[ActivityType, str] | None = None
        if new_status != interview.status:
            if new_status == InterviewStatus.CANCELLED:
                activity = ActivityType.INTERVIEW_CANCELLED, f"{title} cancelled"
            elif new_status == InterviewStatus.COMPLETED:
                activity = ActivityType.INTERVIEW_COMPLETED, f"{title} completed"
            else:
                activity = ActivityType.INTERVIEW_SCHEDULED, f"{title} rescheduled"
        elif rescheduled:
            activity = ActivityType.INTERVIEW_SCHEDULED, f"{title} rescheduled"
        if activity:
            record_activity(
                self.session,
                interview.application_id,
                activity[0],
                activity[1],
                metadata={"interview_id": interview.id, "scheduled_at": changed.get("scheduled_at"), "origin": ORIGIN},
                at=now,
            )
        return 1

    async def _same_interview_scheduled_here(self, application_id: uuid.UUID, start: datetime) -> Interview | None:
        return await self.session.scalar(
            select(Interview).where(
                Interview.application_id == application_id,
                Interview.external_id.is_(None),
                Interview.scheduled_at.between(start - SAME_INTERVIEW_WINDOW, start + SAME_INTERVIEW_WINDOW),
            )
        )

    async def _interview_title(self, application: Application, schedule: InterviewSchedule, event: InterviewEvent) -> str:
        if event.interview and event.interview.title:
            return event.interview.title
        if event.interview_id and self.client is not None:
            if event.interview_id not in self._interview_titles:
                try:
                    info = await self.client.interview_info(event.interview_id)
                    self._interview_titles[event.interview_id] = info.get("externalTitle") or info.get("title")
                except AshbyError as exc:
                    logger.info("ashby.interview_info_unavailable interview=%s error=%s", event.interview_id, exc)
                    self._interview_titles[event.interview_id] = None
            if title := self._interview_titles[event.interview_id]:
                return title
        if schedule.interview_stage_id and schedule.interview_stage_id == application.external_stage_id:
            return application.external_stage_title or "Interview"
        return "Interview"

    # Merges

    async def merge_candidates(self, merge: CandidateMerge) -> str:
        """Ashby merged two profiles and kept merged_candidate's id. Returns what was done."""
        gone = await self._candidate(merge.deleted_candidate.id)
        if gone is None:
            return "The merged-away candidate isn't in Talent Bridge."
        kept = await self._candidate(merge.merged_candidate.id)
        if kept is None:
            gone.external_id = merge.merged_candidate.id
            return "Re-linked the candidate to the merged Ashby profile."
        if gone.user_id is not None:
            raise SkipRecord("Both merged profiles are in Talent Bridge and the merged-away one has a portal sign-in. Review them manually.")
        await self.session.execute(
            update(Application).where(Application.candidate_id == gone.id).values(candidate_id=kept.id)
        )
        await self.session.delete(gone)
        return "Moved the merged-away candidate's applications to the merged profile."

    # Lookups

    async def has_job(self, external_id: str) -> bool:
        return await self._job(external_id) is not None

    async def _job(self, external_id: str) -> Job | None:
        return await self.session.scalar(
            select(Job).where(Job.external_id == external_id).execution_options(populate_existing=True)
        )

    async def _candidate(self, external_id: str) -> Candidate | None:
        return await self.session.scalar(
            select(Candidate).where(Candidate.external_id == external_id).execution_options(populate_existing=True)
        )


def data_stage_title(data: AshbyApplication) -> str | None:
    return data.current_interview_stage.title if data.current_interview_stage else None


def _raw_state(data: AshbyApplication, state: mapping.ApplicationState) -> dict[str, Any]:
    stage = data.current_interview_stage
    return {
        "external_id": data.id,
        "external_status": data.status,
        "external_stage_id": stage.id if stage else None,
        "external_stage_title": stage.title if stage else None,
        "external_stage_type": stage.type if stage else None,
        "external_archive_reason_type": state.reason_type,
        "external_updated_at": data.updated_at,
    }


def _is_older(incoming: datetime | None, applied: datetime | None) -> bool:
    """Whether a payload is older than the version already applied. Unversioned payloads apply."""
    return incoming is not None and applied is not None and incoming < applied


def _same(column: InstrumentedAttribute[Any], value: Any) -> ColumnElement[bool]:
    return column.is_(None) if value is None else column == value


def _assign(row: Any, values: Mapping[str, Any]) -> None:
    for key, value in values.items():
        if getattr(row, key) != value:
            setattr(row, key, value)
