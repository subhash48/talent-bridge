-- Talent Bridge migration 003: candidates
-- Purpose: the people in the pipeline. A candidate's stage lives on each application (004), never
-- here, because one person can apply to several jobs.

create table public.candidates (
  id          uuid primary key default gen_random_uuid(),
  external_id text unique,
  first_name  text not null,
  last_name   text not null,
  email       text not null unique check (email = lower(email)),
  phone       text,
  location    text,
  avatar_url  text,
  headline    text,
  resume_url  text,
  pronouns    text,
  skills      jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();
