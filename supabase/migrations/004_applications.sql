-- Talent Bridge migration 004: applications
-- Purpose: one candidate's candidacy for one job, where the pipeline stage lives, and the
-- append-only history of every stage it has been in.

create type public.application_stage as enum (
  'sourced', 'screening', 'interview', 'offer', 'hired', 'rejected'
);

create table public.applications (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id       uuid not null references public.jobs (id) on delete restrict,
  stage        public.application_stage not null default 'sourced',
  source       text,
  applied_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Archived applications leave the active pipeline but keep their history.
  archived_at  timestamptz,
  constraint applications_candidate_job_key unique (candidate_id, job_id)
);

create index applications_candidate_id_idx on public.applications (candidate_id);
create index applications_job_id_idx on public.applications (job_id);
create index applications_stage_idx on public.applications (stage) where archived_at is null;

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

create table public.candidate_stage_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  previous_stage public.application_stage,  -- null for the first stage
  new_stage      public.application_stage not null,
  changed_by     uuid references public.users (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index candidate_stage_history_application_idx
  on public.candidate_stage_history (application_id, changed_at);
