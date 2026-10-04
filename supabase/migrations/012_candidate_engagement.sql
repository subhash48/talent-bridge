-- Talent Bridge migration 012: candidate engagement
-- Purpose: explicit, first-party portal activity, from which the recruiter-only engagement
-- indicator is computed on read (backend/app/services/engagement). It is operational information
-- only: nothing here feeds qualification, ranking, AI analysis or any stage change.
--
-- No keystrokes, pointer positions, browser fingerprints or browsing outside the portal are
-- recorded, and message text is never copied here.

-- What a candidate said their message is, chosen in the portal. Never inferred from the text.
alter table public.messages
  add column kind text not null default 'message'
    check (kind in ('message', 'thank_you', 'follow_up', 'question'));

-- One portal visit in one application's context. client_session_id is random per browser tab, so a
-- reload is the same visit. active_seconds only grows from heartbeats the server times itself, and
-- only while the tab is visible and in use; idle gaps and background time add nothing.
create table public.portal_sessions (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates (id) on delete cascade,
  application_id    uuid not null references public.applications (id) on delete cascade,
  client_session_id uuid not null,
  started_at        timestamptz not null default now(),
  last_active_at    timestamptz not null default now(),
  ended_at          timestamptz,
  active_seconds    integer not null default 0 check (active_seconds >= 0),
  page_views        integer not null default 0 check (page_views >= 0),
  constraint portal_sessions_visit_key unique (candidate_id, client_session_id, application_id)
);

create index portal_sessions_candidate_idx on public.portal_sessions (candidate_id, started_at desc);
create index portal_sessions_application_idx on public.portal_sessions (application_id, started_at desc);

-- Explicit portal actions: logins, page and feature views, reading messages. event_type is text
-- (EngagementEventType in backend/app/core/enums.py), validated by the API.
create table public.candidate_engagement_events (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  session_id     uuid references public.portal_sessions (id) on delete set null,
  event_type     text not null,
  source         text not null default 'candidate_portal' check (source in ('candidate_portal', 'server')),
  occurred_at    timestamptz not null default now(),
  metadata       jsonb,
  dedupe_key     text unique
);

create index candidate_engagement_events_candidate_idx
  on public.candidate_engagement_events (candidate_id, occurred_at desc);
create index candidate_engagement_events_application_idx
  on public.candidate_engagement_events (application_id, occurred_at desc)
  where application_id is not null;

alter table public.portal_sessions enable row level security;
alter table public.candidate_engagement_events enable row level security;
