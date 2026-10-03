-- Talent Bridge migration 009: row-level security
-- Purpose: keep the tables private to the API. The browser never queries these tables: it calls the
-- FastAPI backend, which connects as the database owner (DATABASE_URL) and so bypasses RLS. With RLS
-- on and no policies, Supabase's anon and authenticated keys can read and write nothing here.
-- Add policies only when a client needs direct access (for example the candidate portal via Realtime).

alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.candidate_stage_history enable row level security;
alter table public.interviews enable row level security;
alter table public.messages enable row level security;
alter table public.candidate_activity enable row level security;
alter table public.ai_analysis enable row level security;
