-- TalentBridge migration 020: what a small business hires on, and what each application says
-- Purpose: a small business's job is a few plain facts (the pay, the shift, the days, how many people), and
-- the applicant answers the questions those facts raise (which of those days they can work, and their
-- relevant experience). The answers belong to the application, like the phone number and LinkedIn profile
-- the applicant gives with it: what they gave this employer, which this employer may use to contact them
-- about this job and nothing else. All new columns, all optional; nothing existing changes meaning.
-- Needs 001-019 first.

alter table public.jobs
  add column pay       text check (pay is null or length(trim(pay)) between 1 and 100),   -- "$18/hour", as the employer said it
  add column shift     text check (shift is null or length(trim(shift)) between 1 and 100), -- "Evenings"
  add column work_days jsonb not null default '[]'::jsonb,                                  -- ["friday", "saturday"]
  add column openings  integer check (openings is null or openings between 1 and 500);

alter table public.applications
  add column phone           text check (phone is null or length(phone) <= 200),  -- forms take 40; room for what's on file
  add column linkedin_url    text check (linkedin_url is null or length(linkedin_url) <= 300),
  add column availability    jsonb not null default '[]'::jsonb,                            -- the job's days they can work
  add column experience_note text check (experience_note is null or length(experience_note) <= 2000);

-- Until now a phone number was kept only on the person. The number each existing application came with is
-- the one on file, so it becomes that application's own, as it was written (some hold two numbers, longer
-- than a form takes). The backfill leaves updated_at as it was.
alter table public.applications disable trigger applications_set_updated_at;
update public.applications a
set phone = c.phone
from public.candidates c
where c.id = a.candidate_id and c.phone is not null and length(c.phone) <= 200 and a.phone is null;
alter table public.applications enable trigger applications_set_updated_at;
