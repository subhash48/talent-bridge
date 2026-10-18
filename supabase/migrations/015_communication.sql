-- TalentBridge migration 015: candidate communication
-- Purpose: what keeps candidates from being forgotten. The SLA rules a recruiter can tune, the AI
-- drafts a recruiter reviews before anything is sent, and how each sent message was delivered (the
-- candidate portal always; email when a provider is configured). New tables only: no existing table
-- or column changes, so code that doesn't use these keeps working on a database without them.
-- Needs 001-014 first.

-- SLA rules. Each rule has a default in backend/app/services/communication/rules.py; a row here is a
-- recruiter's change to it (switched off, or a different threshold).
create table public.communication_rules (
  key             text primary key check (key in (
    'stage_update', 'unanswered_question', 'post_interview', 'interview_unconfirmed', 'no_recent_update')),
  enabled         boolean not null default true,
  -- How long before the rule needs attention: hours since the event, or for interview_unconfirmed,
  -- hours before the interview.
  threshold_hours integer not null check (threshold_hours between 0 and 2160),
  updated_by      uuid references public.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

create trigger communication_rules_set_updated_at
  before update on public.communication_rules
  for each row execute function public.set_updated_at();

-- Updates the AI drafted for a recruiter. Nothing here is ever sent automatically: a recruiter edits
-- and approves a draft, and sending it creates the message. ai_subject and ai_body keep what the AI
-- wrote, so analytics can tell drafts sent as written from drafts the recruiter changed.
create table public.communication_drafts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  -- Why it was drafted: an SLA rule's key, or 'manual' when the recruiter asked for one.
  reason         text not null check (reason in (
    'stage_update', 'unanswered_question', 'post_interview', 'interview_unconfirmed', 'no_recent_update',
    'manual')),
  status         text not null default 'drafted' check (status in ('drafted', 'sent', 'discarded')),
  subject        text not null,
  body           text not null,
  ai_subject     text not null,
  ai_body        text not null,
  model_name     text,
  message_id     uuid references public.messages (id) on delete set null,  -- once sent
  created_by     uuid references public.users (id) on delete set null,
  sent_at        timestamptz,
  discarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index communication_drafts_application_idx on public.communication_drafts (application_id, created_at);
create index communication_drafts_status_idx on public.communication_drafts (status, created_at);

create trigger communication_drafts_set_updated_at
  before update on public.communication_drafts
  for each row execute function public.set_updated_at();

-- How a recruiter's message reached the candidate. The message itself (in messages) is the portal
-- delivery and always happens; this row records the email: sent (the provider accepted it), failed
-- (with a safe error), or not_configured (no email provider, so portal only).
create table public.message_deliveries (
  message_id          uuid primary key references public.messages (id) on delete cascade,
  subject             text not null,
  email_status        text not null check (email_status in ('sent', 'failed', 'not_configured')),
  provider            text,
  provider_message_id text,
  error               text,
  draft_id            uuid references public.communication_drafts (id) on delete set null,
  attempted_at        timestamptz not null default now(),
  sent_at             timestamptz
);

create index message_deliveries_draft_idx on public.message_deliveries (draft_id);

alter table public.communication_rules enable row level security;
alter table public.communication_drafts enable row level security;
alter table public.message_deliveries enable row level security;
