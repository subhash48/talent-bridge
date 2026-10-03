-- Talent Bridge migration 007: candidate activity
-- Purpose: the append-only timeline of each application. activity_type is text (see ActivityType
-- in backend/app/core/enums.py), so new kinds of activity don't need a migration.

create table public.candidate_activity (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  activity_type  text not null,
  title          text not null,
  description    text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create index candidate_activity_application_idx
  on public.candidate_activity (application_id, created_at desc);
