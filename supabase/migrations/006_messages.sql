-- Talent Bridge migration 006: messages
-- Purpose: one thread per application. The AI only drafts; people send.

create type public.message_sender_type as enum ('candidate', 'recruiter', 'system', 'ai');

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sender_type    public.message_sender_type not null,
  content        text not null check (length(trim(content)) > 0),
  created_at     timestamptz not null default now(),
  -- When a recruiter read a candidate's message; null means unread.
  read_at        timestamptz
);

create index messages_application_idx on public.messages (application_id, created_at);
create index messages_unread_idx on public.messages (application_id)
  where sender_type = 'candidate' and read_at is null;
