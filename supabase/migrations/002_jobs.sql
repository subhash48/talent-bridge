-- Talent Bridge migration 002: jobs
-- Purpose: the roles candidates apply to. external_id holds the Ashby job id once synced.

create type public.job_status as enum ('draft', 'open', 'closed');

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  external_id     text unique,
  title           text not null check (length(trim(title)) > 0),
  department      text,
  location        text,
  description     text,
  status          public.job_status not null default 'draft',
  employment_type text not null default 'Full-time',
  hiring_manager  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();
