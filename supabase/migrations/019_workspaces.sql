-- TalentBridge migration 019: workspaces
-- Purpose: each employer's hiring data is its own. A company is a workspace: the people who hire for it
-- (users.company_id) see only its jobs and the applications, candidates, messages and interviews that
-- belong to them. The backend enforces it on every recruiter request (backend/app/core/tenancy.py).
-- A workspace is a full recruiting workspace or Simple Hire (companies.workspace_mode): the same tables
-- and services, with a simpler interface for small businesses. The communication SLA rules become each
-- workspace's own, so one employer's thresholds never change another's.
-- Needs 001-018 first. Deploy it before the backend that reads users.company_id.

alter table public.companies
  add column workspace_mode text not null default 'full' check (workspace_mode in ('full', 'simple'));

-- Null for candidates. Staff without a company can't use the recruiter workspace until they have one.
alter table public.users add column company_id uuid references public.companies (id) on delete restrict;
create index users_company_idx on public.users (company_id);
alter table public.users
  add constraint users_candidates_have_no_company check (role <> 'candidate' or company_id is null);

-- The staff who exist today hire for the workspace's own company: the oldest one, the rule 017 used for
-- jobs. The backfill leaves updated_at as it was (018's backfill didn't, and moved those rows' times).
alter table public.users disable trigger users_set_updated_at;
update public.users
set company_id = (select id from public.companies order by created_at, id limit 1)
where role in ('recruiter', 'admin') and company_id is null;
alter table public.users enable trigger users_set_updated_at;

-- SLA rule changes belong to a workspace. The changes made so far were made for the oldest company's.
alter table public.communication_rules add column company_id uuid references public.companies (id) on delete cascade;
alter table public.communication_rules disable trigger communication_rules_set_updated_at;
update public.communication_rules
set company_id = (select id from public.companies order by created_at, id limit 1)
where company_id is null;
alter table public.communication_rules enable trigger communication_rules_set_updated_at;
-- Only possible with no company at all, when no rule can apply to anyone.
delete from public.communication_rules where company_id is null;
alter table public.communication_rules drop constraint communication_rules_pkey;
alter table public.communication_rules alter column company_id set not null;
alter table public.communication_rules add primary key (company_id, key);
