"""Reconciliation sync: pull what changed in Ashby and upsert it, repairing anything webhooks missed
(webhooks that failed for good, events from before they were set up, and ingestion paths Ashby
doesn't fire applicationSubmit for, such as bulk imports).

    python -m app.integrations.ashby.sync              changes since the last sync
    python -m app.integrations.ashby.sync --full       everything (ignores the stored sync tokens)
    python -m app.integrations.ashby.sync jobs applications

Each resource keeps Ashby's incremental sync token in ashby_sync_state. An expired or unusable token
falls back to a full sync, as Ashby's guide prescribes. Every record is upserted with the same
importer the webhooks use and committed on its own, so the sync is safe to run at any time, as often
as you like, alongside live webhooks, and one bad record never holds up the rest.

Candidates come in with their applications. The candidates pass refreshes details (headline,
location) of candidates already here; it doesn't import every person in Ashby.
"""

import argparse
import asyncio
import logging
import sys
import uuid
from collections.abc import Mapping
from datetime import timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.enums import ApplicationStage
from app.integrations.ashby.client import AshbyClient, AshbyError, AshbyRestartSync, get_ashby_client
from app.integrations.ashby.importer import AshbyImporter, NotReady, SkipRecord
from app.integrations.ashby.schemas import AshbyApplication, AshbyCandidate, AshbyJob, InterviewSchedule
from app.integrations.supabase_admin import SupabaseAdmin, get_supabase_admin
from app.models import AshbySyncState, Candidate
from app.models.base import utcnow
from app.schemas.integration import SyncReport, SyncResourceReport
from app.services import account_provisioning

logger = logging.getLogger(__name__)

# In dependency order: applications need their jobs, interviews need their applications.
RESOURCES = ("jobs", "candidates", "applications", "interviews")
ENDPOINTS = {
    "jobs": "job.list",
    "candidates": "candidate.list",
    "applications": "application.list",
    "interviews": "interviewSchedule.list",
}
MAX_PROBLEMS = 5


class AshbySync:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        client: AshbyClient,
        *,
        admin: SupabaseAdmin | None = None,
        title_map: Mapping[str, ApplicationStage] | None = None,
        invites_enabled: bool = True,
        invite_max_age: timedelta = timedelta(days=14),
    ) -> None:
        self.session_factory = session_factory
        self.client = client
        self.admin = admin
        self.title_map = title_map or {}
        self.invites_enabled = invites_enabled
        self.invite_max_age = invite_max_age

    async def run(self, resources: tuple[str, ...] = RESOURCES, *, full: bool = False) -> SyncReport:
        reports = [await self.sync_resource(resource, full=full) for resource in resources]
        invitations = (
            await account_provisioning.retry_pending_invitations(self.session_factory, self.admin)
            if self.invites_enabled
            else {}
        )
        return SyncReport(resources=reports, invitations=invitations)

    async def sync_resource(self, resource: str, *, full: bool = False) -> SyncResourceReport:
        async with self.session_factory() as session:
            state = await session.get(AshbySyncState, resource)
            if state is None:
                state = AshbySyncState(resource=resource)
                session.add(state)
            state.last_started_at = utcnow()
            token = None if full else state.sync_token
            await session.commit()

        report = SyncResourceReport(resource=resource, full_sync=token is None)
        try:
            try:
                listed = await self.client.list_all(ENDPOINTS[resource], sync_token=token)
            except AshbyRestartSync:
                logger.info("ashby.sync_restart resource=%s", resource)
                report.full_sync = True
                listed = await self.client.list_all(ENDPOINTS[resource])
        except AshbyError as exc:
            report.error = str(exc)
            await self._save(resource, report, sync_token=None)
            logger.warning("ashby.sync resource=%s result=error error=%s", resource, exc)
            return report

        report.fetched = len(listed.results)
        invite_ids: set[uuid.UUID] = set()
        for record in listed.results:
            async with self.session_factory() as session:
                importer = AshbyImporter(
                    session, client=self.client, title_map=self.title_map, invites_enabled=self.invites_enabled
                )
                try:
                    outcome = await self._apply(importer, session, resource, record, invite_ids)
                    await session.commit()
                except (SkipRecord, NotReady, ValidationError) as exc:
                    await session.rollback()
                    report.skipped += 1
                    if len(report.problems) < MAX_PROBLEMS:
                        detail = "unreadable record" if isinstance(exc, ValidationError) else str(exc)
                        report.problems.append(f"{record.get('id', '?')}: {detail}")
                    continue
                except AshbyError as exc:  # a lookup the record needed failed; the next sync retries it
                    await session.rollback()
                    report.skipped += 1
                    if len(report.problems) < MAX_PROBLEMS:
                        report.problems.append(f"{record.get('id', '?')}: {exc}")
                    continue
            setattr(report, outcome, getattr(report, outcome) + 1)

        if invite_ids:
            async with self.session_factory() as session:
                for candidate_id in invite_ids:
                    await account_provisioning.provision_portal_account(session, candidate_id, self.admin)
        await self._save(resource, report, sync_token=listed.sync_token)
        logger.info(
            "ashby.sync resource=%s full=%s fetched=%d created=%d updated=%d unchanged=%d skipped=%d",
            resource,
            report.full_sync,
            report.fetched,
            report.created,
            report.updated,
            report.unchanged,
            report.skipped,
        )
        return report

    async def _apply(
        self,
        importer: AshbyImporter,
        session: AsyncSession,
        resource: str,
        record: dict[str, Any],
        invite_ids: set[uuid.UUID],
    ) -> str:
        """Upsert one record. Returns which counter it belongs to."""
        if resource == "jobs":
            job = AshbyJob.model_validate(record)
            existed = await importer.has_job(job.id)
            await importer.upsert_job(job)
            return "updated" if existed else "created"
        if resource == "candidates":
            candidate = AshbyCandidate.model_validate(record)
            known = await session.scalar(select(Candidate.id).where(Candidate.external_id == candidate.id))
            if known is None:
                return "unchanged"  # people come in with their applications
            await importer.upsert_candidate(candidate)
            return "updated"
        if resource == "applications":
            application = AshbyApplication.model_validate(record)
            recent = application.created_at is not None and utcnow() - application.created_at <= self.invite_max_age
            result = await importer.upsert_application(application, may_invite=recent)
            if result.invite:
                invite_ids.add(result.candidate_id)
            if result.created:
                return "created"
            return "updated" if result.changed else "unchanged"
        schedule = InterviewSchedule.model_validate(record)
        return "updated" if await importer.upsert_schedule(schedule) else "unchanged"

    async def _save(self, resource: str, report: SyncResourceReport, *, sync_token: str | None) -> None:
        async with self.session_factory() as session:
            state = await session.get(AshbySyncState, resource)
            assert state is not None
            now = utcnow()
            if report.error:
                state.last_error, state.last_error_at = report.error, now
            else:
                state.sync_token = sync_token
                state.last_success_at = now
                state.last_error = None
            state.last_result = report.model_dump(mode="json")
            await session.commit()


def sync_from_settings(
    session_factory: async_sessionmaker[AsyncSession], client: AshbyClient, admin: SupabaseAdmin | None
) -> AshbySync:
    return AshbySync(
        session_factory,
        client,
        admin=admin,
        title_map=settings.ashby_stage_title_map,
        invites_enabled=settings.portal_invites_enabled,
        invite_max_age=timedelta(days=settings.ashby_sync_invite_max_age_days),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Pull changes from Ashby into Talent Bridge.")
    parser.add_argument("resources", nargs="*", metavar="resource", help=f"any of {', '.join(RESOURCES)} (default: all)")
    parser.add_argument("--full", action="store_true", help="ignore the stored sync tokens and fetch everything")
    args = parser.parse_args()
    unknown = set(args.resources) - set(RESOURCES)
    if unknown:
        parser.error(f"unknown resource {', '.join(sorted(unknown))}; use {', '.join(RESOURCES)}")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    async def run() -> int:
        from app.core.database import dispose_engine, get_sessionmaker

        client = get_ashby_client()
        if client is None:
            print("ASHBY_API_KEY isn't set in backend/.env, so there is nothing to sync.")
            return 1
        try:
            resources = tuple(resource for resource in RESOURCES if resource in args.resources) or RESOURCES
            report = await sync_from_settings(get_sessionmaker(), client, get_supabase_admin()).run(
                resources, full=args.full
            )
        finally:
            await dispose_engine()
        print(report.model_dump_json(indent=2))
        return 1 if any(item.error for item in report.resources) else 0

    sys.exit(asyncio.run(run()))


if __name__ == "__main__":
    main()
