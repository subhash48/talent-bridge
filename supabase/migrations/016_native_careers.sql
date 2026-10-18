-- TalentBridge migration 016: applying on TalentBridge's own careers site
-- Purpose: résumés sent with applications made on the careers site (/careers), stored privately for
-- recruiters, with their text so interview preparation can draw on it. New table only.
-- Needs 001-015 first.

create table public.candidate_resumes (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,  -- the one it came with
  file_name      text not null,
  content_type   text not null check (content_type in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256         text not null,
  content        bytea not null,
  -- Plain text read from the file (PDF and DOCX), for the candidate's interview preparation. Null when
  -- none could be read (a scanned PDF, a DOC file).
  text           text,
  created_at     timestamptz not null default now()
);

create index candidate_resumes_candidate_idx on public.candidate_resumes (candidate_id, created_at desc);

alter table public.candidate_resumes enable row level security;
