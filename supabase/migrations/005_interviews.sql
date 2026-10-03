-- Talent Bridge migration 005: interviews
-- Purpose: interviews per application. confirmed_at records the candidate's confirmation; notes
-- hold interviewer feedback, so a completed interview without notes is still waiting on feedback.

create type public.interview_type as enum ('video', 'phone', 'onsite');
create type public.interview_status as enum ('scheduled', 'completed', 'cancelled');

create table public.interviews (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.applications (id) on delete cascade,
  title            text not null,
  interview_type   public.interview_type not null default 'video',
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  status           public.interview_status not null default 'scheduled',
  meeting_url      text,
  notes            text,
  interviewers     jsonb not null default '[]'::jsonb check (jsonb_typeof(interviewers) = 'array'),
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index interviews_application_idx on public.interviews (application_id, scheduled_at);
create index interviews_scheduled_at_idx on public.interviews (scheduled_at);

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();
