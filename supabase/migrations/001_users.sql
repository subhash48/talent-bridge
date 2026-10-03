-- Talent Bridge migration 001: users
-- Purpose: shared helpers and the people who sign in (recruiters and admins now, candidates later).
-- The backend models in backend/app/models mirror this schema.

-- Keeps updated_at current on every UPDATE, including edits made outside the API.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.user_role as enum ('recruiter', 'candidate', 'admin');

-- When Supabase Auth is added, link rows to auth.users(id); the API will resolve the signed-in
-- user from the access token and keep using this table for role.
create table public.users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(email)),
  full_name  text not null,
  role       public.user_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
