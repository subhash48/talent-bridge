-- Talent Bridge migration 014: candidate portal analytics, voluntary demographics and the recruiter assistant
-- Purpose: what recruiters need to see how candidates use the portal (in aggregate only), the
-- voluntary demographic answers candidates may give, the pay range of a demo job, and the recruiter
-- assistant's record of requests and confirmations. Additive only: no existing column changes.
-- Needs 013 (demo careers) first.

-- Voluntary demographic information, kept apart from the candidate record. Every answer is optional
-- (null when unanswered) and each question has its own 'prefer_not_to_say'. Only the candidate reads
-- or changes their own answers; recruiters only ever see aggregates with small groups suppressed
-- (backend/app/services/demographics.py). Nothing else in the schema refers to this table, and no
-- search, sort, filter, ranking or AI context reads it.
create table public.candidate_demographics (
  candidate_id       uuid primary key references public.candidates (id) on delete cascade,
  region             text check (region in (
    'united_states', 'india', 'united_kingdom', 'canada', 'germany', 'other', 'prefer_not_to_say')),
  race_ethnicity     text check (race_ethnicity in (
    'asian', 'black', 'hispanic_latino', 'middle_eastern_north_african', 'white', 'multiracial',
    'another_identity', 'prefer_not_to_say')),
  disability_status  text check (disability_status in ('yes', 'no', 'prefer_not_to_say')),
  sexual_orientation text check (sexual_orientation in (
    'straight', 'gay', 'lesbian', 'bisexual', 'asexual', 'queer', 'another_identity', 'prefer_not_to_say')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger candidate_demographics_set_updated_at
  before update on public.candidate_demographics
  for each row execute function public.set_updated_at();

-- Answers given with an application on the demo careers site, held until the application is
-- submitted (the applicant proves they own the email). They then move to candidate_demographics and
-- this row is deleted.
create table public.demo_application_demographics (
  demo_application_id uuid primary key references public.demo_applications (id) on delete cascade,
  region              text,
  race_ethnicity      text,
  disability_status   text,
  sexual_orientation  text,
  created_at          timestamptz not null default now()
);

-- A demo job's pay range, as the recruiter set it: whole units of salary_currency a year. The AI job
-- writer never sets or invents it.
alter table public.demo_job_postings
  add column salary_min      integer check (salary_min > 0),
  add column salary_max      integer check (salary_max > 0),
  add column salary_currency text not null default 'USD' check (salary_currency ~ '^[A-Z]{3}$'),
  add constraint demo_job_postings_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max);

-- New portal events need no schema change: candidate_engagement_events.event_type is text
-- ('company_section_viewed' and 'ai_question_asked' join the list in backend/app/core/enums.py). An
-- AI question is kept as its topic only, never its words.

-- The recruiter assistant's requests, typed or spoken (a transcript; the recording is never kept),
-- each with the structured action it was understood as, its target and its result. An external
-- action (sending a message, publishing a job) waits here as 'proposed' until the recruiter confirms
-- it, and moves on exactly once: one confirmation is one send. client_request_id makes a repeated
-- request (a double click) one request.
create table public.assistant_actions (
  id                uuid primary key default gen_random_uuid(),
  recruiter_id      uuid not null references public.users (id) on delete cascade,
  client_request_id text,
  input_type        text not null check (input_type in ('text', 'voice')),
  input_text        text not null,
  intent            text,
  status            text not null default 'processing' check (status in (
    'processing', 'answered', 'needs_clarification', 'proposed', 'executing', 'completed', 'failed', 'cancelled')),
  target_type       text,
  target_id         uuid,
  target_label      text,
  payload           jsonb,
  result_summary    text,
  error             text,
  executed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint assistant_actions_request_key unique (recruiter_id, client_request_id)
);

create index assistant_actions_recruiter_idx on public.assistant_actions (recruiter_id, created_at desc);

create trigger assistant_actions_set_updated_at
  before update on public.assistant_actions
  for each row execute function public.set_updated_at();

-- Portal analytics read portal_sessions by start time and events by type and time.
create index portal_sessions_started_idx on public.portal_sessions (started_at);
create index candidate_engagement_events_type_idx on public.candidate_engagement_events (event_type, occurred_at);

alter table public.candidate_demographics enable row level security;
alter table public.demo_application_demographics enable row level security;
alter table public.assistant_actions enable row level security;
