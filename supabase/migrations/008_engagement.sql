-- Talent Bridge migration 008: AI analysis
-- Purpose: derived per-application analysis for recruiter review. It records evidence, gaps and
-- questions; it never stores or applies a hiring decision. (Engagement is computed by the API from
-- candidate_activity on every read, so it has no table.)

create table public.ai_analysis (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications (id) on delete cascade,
  summary               text not null,
  skills_matched        jsonb not null default '[]'::jsonb,  -- [{"skill": "...", "evidence": "..."}]
  missing_skills        jsonb not null default '[]'::jsonb,
  strengths             jsonb not null default '[]'::jsonb,
  concerns              jsonb not null default '[]'::jsonb,
  suggested_questions   jsonb not null default '[]'::jsonb,
  recommended_next_step text not null,
  model_name            text,
  created_at            timestamptz not null default now()
);

create index ai_analysis_application_idx on public.ai_analysis (application_id, created_at desc);
