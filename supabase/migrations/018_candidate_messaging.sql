-- TalentBridge migration 018: candidate messaging, switched on per application by a recruiter
-- Purpose: a candidate can always read what the hiring team sends, but can only write to them about an
-- application once a recruiter has reviewed it and turned messaging on. One column on applications; the
-- default is off, so a new application never opens a conversation by itself.
-- Needs 001-017 first.

alter table public.applications
  add column candidate_messaging_enabled boolean not null default false;

-- Conversations a candidate already took part in stay open: they started before this setting existed.
update public.applications a
set candidate_messaging_enabled = true
where exists (
  select 1 from public.messages m where m.application_id = a.id and m.sender_type = 'candidate'
);
