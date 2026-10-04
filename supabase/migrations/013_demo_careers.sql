-- Talent Bridge migration 013: demo careers (development only)
-- Purpose: recruiter-created demo jobs published to the development-only careers site (/demo/careers),
-- and the applications made there while they wait for the applicant to activate their portal account.
-- The API refuses every demo route unless ENABLE_ASHBY_DEMO=true and ENVIRONMENT isn't production, so
-- in production these tables stay empty. Additive only: no existing table or column changes.

-- A demo job is an ordinary jobs row (with a tb-demo- Ashby id from the simulator), so its pipeline,
-- candidates and AI analysis work as for any job. Its posting lives here. status is the posting's,
-- separate from jobs.status (the ATS status):
--   draft      not on the careers site: never published, or unpublished
--   published  listed on /demo/careers and taking applications
--   closed     the job closed: not listed and no new applications; existing ones stay
create table public.demo_job_postings (
  job_id                   uuid primary key references public.jobs (id) on delete cascade,
  status                   text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  work_arrangement         text check (work_arrangement in ('On-site', 'Hybrid', 'Remote')),
  seniority                text,
  skills                   jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  -- The recruiter's brief for the AI job writer. Never shown on the careers site.
  notes                    text,
  summary                  text,
  about_role               text,
  responsibilities         jsonb not null default '[]'::jsonb check (jsonb_typeof(responsibilities) = 'array'),
  requirements             jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  preferred_qualifications jsonb not null default '[]'::jsonb
    check (jsonb_typeof(preferred_qualifications) = 'array'),
  about_team               text,
  -- The model that drafted the text, when the AI job writer did; the recruiter may have edited it since.
  generated_by_model       text,
  created_by               uuid references public.users (id) on delete set null,
  published_at             timestamptz,  -- the latest publish
  closed_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index demo_job_postings_status_idx on public.demo_job_postings (status);

create trigger demo_job_postings_set_updated_at
  before update on public.demo_job_postings
  for each row execute function public.set_updated_at();

-- An application made on /demo/careers. Recruiters don't see it until the applicant proves they own
-- the email, by accepting their portal invitation or signing in to the account they already have.
-- Then it is delivered through the Ashby simulator, which creates the candidate and the application
-- (application_id). One per email and job.
create table public.demo_applications (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs (id) on delete cascade,
  email               text not null check (email = lower(email)),
  first_name          text not null,
  last_name           text not null,
  phone               text not null,
  linkedin_url        text,
  status              text not null default 'awaiting_activation'
    check (status in ('awaiting_activation', 'awaiting_sign_in', 'submitted')),
  -- The Supabase Auth account invited for this email, or found for it, when known.
  auth_user_id        uuid references auth.users (id) on delete set null,
  invited_at          timestamptz,
  -- A short, safe summary. Never a token or a provider's response body.
  invite_error        text,
  finalizing_at       timestamptz,  -- a submission in flight (a short lease)
  submitted_at        timestamptz,
  application_id      uuid references public.applications (id) on delete set null,
  resume_file_name    text not null,
  resume_content_type text not null,
  resume_size_bytes   integer not null check (resume_size_bytes > 0),
  resume_sha256       text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint demo_applications_email_job_key unique (email, job_id)
);

create index demo_applications_auth_user_idx on public.demo_applications (auth_user_id);

create trigger demo_applications_set_updated_at
  before update on public.demo_applications
  for each row execute function public.set_updated_at();

-- The résumé file, kept apart so lists never load it. Private: only the API reads it, and only for
-- recruiters once the application has been submitted.
create table public.demo_resumes (
  demo_application_id uuid primary key references public.demo_applications (id) on delete cascade,
  content             bytea not null,
  created_at          timestamptz not null default now()
);

alter table public.demo_job_postings enable row level security;
alter table public.demo_applications enable row level security;
alter table public.demo_resumes enable row level security;
