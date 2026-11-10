-- TalentBridge migration 022: the public job board
-- Purpose: hirvello.com/jobs lists every open public job of every employer, in one place, with search and
-- filters. A job records who posted it (jobs.posted_by: a recruiting team, or a small business on Simple Hire),
-- taken from the employer's workspace when it's posted and never changed afterwards, so a job doesn't move
-- between the board's tabs when a workspace switches mode. Where the work happens, the pay as numbers, whether
-- the job is on the board at all, when it was first opened and when it stops taking applications become
-- columns the board can filter and sort on. Existing jobs are read for what they already say: their company's
-- workspace for who posted them, their free-text location for the work arrangement.
-- Needs 001-021 first. Deploy it before the backend that reads jobs.posted_by.

alter table public.jobs
  add column posted_by        text check (posted_by in ('recruiter', 'small_business')),
  add column work_arrangement text check (work_arrangement in ('onsite', 'hybrid', 'remote')),
  add column salary_min       integer check (salary_min >= 0),                 -- whole units of salary_currency
  add column salary_max       integer check (salary_max >= 0),
  add column salary_currency  text check (salary_currency ~ '^[A-Z]{3}$'),     -- "USD"
  add column salary_period    text check (salary_period in ('year', 'month', 'hour')),
  add column visibility       text not null default 'public' check (visibility in ('public', 'private')),
  add column published_at     timestamptz,                                     -- the first time it opened
  add column expires_at       timestamptz,                                     -- after this: off the board, no applications
  add constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_max >= salary_min);

-- The jobs that exist today, as they are. The backfill leaves updated_at as it was.
alter table public.jobs disable trigger jobs_set_updated_at;
update public.jobs j
set posted_by = case when c.workspace_mode = 'simple' then 'small_business' else 'recruiter' end
from public.companies c
where c.id = j.company_id and j.posted_by is null;
-- "London, UK · Hybrid", "Remote-friendly": remote wins over hybrid, and hybrid over on-site.
update public.jobs
set work_arrangement = case
  when location ilike '%remote%' then 'remote'
  when location ilike '%hybrid%' then 'hybrid'
  when location ilike '%on-site%' or location ilike '%onsite%' or location ilike '%in office%' then 'onsite'
end
where work_arrangement is null and location is not null;
-- A job that is or was open has been on the careers site since it was made: the closest known time.
update public.jobs set published_at = created_at where published_at is null and status in ('open', 'closed');
alter table public.jobs enable trigger jobs_set_updated_at;

-- A backend still on the previous release inserts jobs without posted_by or published_at: they get their company's, and
-- an open one is published as it's made. This runs
-- after jobs_default_company (triggers on one event fire in name order), so the company is already set.
create function public.jobs_default_posted_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- And when it went on the board: an open job published now (the new backend sets both itself).
  if new.published_at is null and new.status = 'open' then
    new.published_at := now();
  end if;
  if new.posted_by is null then
    select case when c.workspace_mode = 'simple' then 'small_business' else 'recruiter' end
    into new.posted_by
    from public.companies c
    where c.id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger jobs_default_posted_by
  before insert on public.jobs
  for each row execute function public.jobs_default_posted_by();

alter table public.jobs alter column posted_by set not null;

-- The board: open jobs, newest first, in the order it sorts them (published, else made).
create index jobs_board_idx on public.jobs (status, (coalesce(published_at, created_at)) desc);
