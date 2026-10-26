-- TalentBridge migration 021: the public website's contact form
-- Purpose: what people send through "Contact TalentBridge": who they are, what it's about and their
-- message, kept so nothing sent is lost when email isn't set up. Only the backend reads or writes it.
-- Needs 001-020 first.

create table public.contact_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 100),
  email        text not null check (length(email) between 3 and 254),
  company      text check (company is null or length(company) <= 200),
  topic        text not null check (topic in ('product', 'pilot', 'support', 'partnerships', 'general')),
  message      text not null check (length(trim(message)) between 1 and 5000),
  -- How it reached the team: emailed to CONTACT_EMAIL (sent / failed), or kept here only (not_configured).
  email_status text not null default 'not_configured' check (email_status in ('sent', 'failed', 'not_configured')),
  created_at   timestamptz not null default now()
);

create index contact_requests_created_idx on public.contact_requests (created_at desc);

alter table public.contact_requests enable row level security;
