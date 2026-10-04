-- Talent Bridge migration 011: Ashby sync and candidate portal access
-- Purpose: keep Ashby's ids and raw state next to ours so webhooks and the reconciliation sync can
-- upsert idempotently, record every webhook once, and track each candidate's portal invitation.
-- Additive except for one constraint, which is narrowed (see applications below).
--
-- Ashby is the system of record. Talent Bridge maps Ashby's raw stage and status onto its own
-- stage (backend/app/integrations/ashby/mapping.py) and keeps the raw values for auditing.

-- Jobs: the Ashby version applied, so an older webhook never overwrites a newer one.
alter table public.jobs
  add column external_updated_at timestamptz;

-- Candidates: Ashby version, and the state of their candidate portal account.
alter table public.candidates
  add column external_updated_at        timestamptz,
  add column portal_status              text not null default 'not_required'
    check (portal_status in ('not_required', 'pending_invitation', 'invited', 'active', 'invite_failed')),
  add column portal_invited_at          timestamptz,
  add column portal_activated_at        timestamptz,
  add column portal_invite_attempts     integer not null default 0 check (portal_invite_attempts >= 0),
  add column portal_invite_attempted_at timestamptz,
  -- A short, safe summary for recruiters. Never a token or a provider's response body.
  add column portal_invite_error        text;

-- Candidates who can already sign in. Those who have are active; the rest become active on their
-- first portal visit.
update public.candidates c
set portal_status = 'active',
    portal_activated_at = a.last_sign_in_at
from public.users u
join auth.users a on a.id = u.auth_user_id
where c.user_id = u.id
  and a.last_sign_in_at is not null;

update public.candidates
set portal_status = 'invited'
where user_id is not null
  and portal_status = 'not_required';

-- Applications: Ashby's id and raw state. Only the archive reason's type is kept, never its text,
-- which is internal to the hiring team.
alter table public.applications
  add column external_id                  text unique,
  add column external_status              text,
  add column external_stage_id            text,
  add column external_stage_title         text,
  add column external_stage_type          text,
  add column external_archive_reason_type text,
  add column external_updated_at          timestamptz;

-- One application per candidate and job still holds for applications made in Talent Bridge. Ashby
-- can hold two for the same job (duplicate profiles merged in Ashby), each with its own id, so
-- synced applications are unique by external_id instead.
alter table public.applications drop constraint applications_candidate_job_key;
create unique index applications_candidate_job_local_key
  on public.applications (candidate_id, job_id)
  where external_id is null;

-- Interviews: one row per Ashby interview event. Interviews scheduled in Talent Bridge have no
-- external id and are never pushed to Ashby, so the two can't loop.
alter table public.interviews
  add column external_id          text unique,
  add column external_schedule_id text,
  add column external_updated_at  timestamptz;

create index interviews_external_schedule_idx
  on public.interviews (external_schedule_id)
  where external_schedule_id is not null;

-- Every webhook event, recorded before it is applied. event_key is "<webhookActionId>:<action>":
-- Ashby repeats the id across retries and across the related webhooks one change fires. The payload
-- isn't stored (it holds personal data, and Ashby resends it on retry); its hash is.
create table public.ashby_webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  event_key          text not null unique,
  action             text not null,
  webhook_action_id  text,
  external_entity_id text,
  payload_sha256     text not null,
  status             text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts           integer not null default 1 check (attempts >= 1),
  error_message      text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  duration_ms        integer
);

create index ashby_webhook_events_received_idx on public.ashby_webhook_events (received_at desc);
create index ashby_webhook_events_failed_idx on public.ashby_webhook_events (received_at desc)
  where status = 'failed';

-- Reconciliation sync progress per resource, with Ashby's incremental sync token.
create table public.ashby_sync_state (
  resource        text primary key check (resource in ('jobs', 'candidates', 'applications', 'interviews')),
  sync_token      text,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  last_result     jsonb,
  updated_at      timestamptz not null default now()
);

create trigger ashby_sync_state_set_updated_at
  before update on public.ashby_sync_state
  for each row execute function public.set_updated_at();

alter table public.ashby_webhook_events enable row level security;
alter table public.ashby_sync_state enable row level security;
