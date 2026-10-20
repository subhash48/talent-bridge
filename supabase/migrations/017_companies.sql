-- TalentBridge migration 017: employers
-- Purpose: the companies candidates apply to. Every job belongs to one, and the candidate portal reads
-- everything it says about an employer through the candidate's own application: application -> job ->
-- company. The profile an employer approves for candidates (the portal's Company page, and what the
-- candidate assistant may say about it) moves out of the backend code into this table.
-- Needs 001-016 first. Deploy it before the backend that reads jobs.company_id.

create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (length(trim(slug)) > 0),
  name           text not null check (length(trim(name)) > 0),
  logo_url       text,
  website        text,
  overview       text not null default '',
  mission        text not null default '',
  highlights     jsonb not null default '[]'::jsonb,  -- [{title, description}]: a figure and what it counts
  products       jsonb not null default '[]'::jsonb,  -- [{title, description}]
  culture        jsonb not null default '[]'::jsonb,  -- [{title, description}]: the values, in its own words
  benefits       jsonb not null default '[]'::jsonb,  -- [text]
  benefits_scope text not null default '',            -- who the listed benefits apply to
  benefits_note  text not null default '',
  locations      jsonb not null default '[]'::jsonb,  -- [text]
  locations_note text not null default '',
  hiring_process jsonb not null default '[]'::jsonb,  -- [text]: the usual stages, in order
  hiring_note    text not null default '',
  links          jsonb not null default '[]'::jsonb,  -- [{label, url}]
  source         text not null default '',            -- where the content came from, and when
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;

alter table public.jobs add column company_id uuid references public.companies (id) on delete restrict;
create index jobs_company_idx on public.jobs (company_id);

-- A database that already has jobs has the demo data, whose jobs are all Encord's. Encord becomes a
-- company row with the profile the backend used to hard-code (from encord.com, October 2026), with the
-- same id the seed gives it, and owns those jobs. An empty database gets its companies from the seed.
insert into public.companies (
  id, slug, name, logo_url, website, overview, mission, highlights, products, culture, benefits, benefits_scope, benefits_note, locations, locations_note, hiring_process, hiring_note, links, source
)
select
  '56bdf318-ed70-5cd7-bd73-762c04d76a9c',
  'encord',
  'Encord',
  '/logos/encord.svg',
  'https://encord.com/',
  'Encord builds the data development platform AI teams use to curate, annotate and evaluate multimodal training data, from images and video to documents and 3D sensor data.',
  'AI alignment starts with Encord: the quality of AI is only as good as the data behind it. Encord builds the infrastructure to build, curate and validate training data, helping the world''s best AI teams move faster, label smarter and ship models that work in production, from autonomous vehicles to surgical robotics.',
  '[{"title": "300+", "description": "leading AI teams build with Encord, including Woven by Toyota, AXA, UiPath and Zipline"}, {"title": "$110M", "description": "total funding raised, from investors including Wellington Management, Y Combinator, CRV and N47"}, {"title": "45+", "description": "nationalities represented on the team"}]'::jsonb,
  '[{"title": "Label and annotate", "description": "Video, LiDAR, audio, text and sensor-fusion annotation in one workflow, with label lineage and quality controls built in for production scale."}, {"title": "Curate and collect", "description": "Collect data from dedicated facilities or a fleet, then use embedding-based search and model-in-the-loop curation to find rare edge cases and close distribution gaps."}, {"title": "Align and evaluate", "description": "RLHF, rubric-based evaluation and pairwise comparison for models in production, to find where AI fails and route it back into training."}, {"title": "Data-as-a-Service", "description": "Expert annotators, domain specialists and managed data collection, including teleoperation facilities for physical AI, integrated with the platform."}]'::jsonb,
  '[{"title": "High agency", "description": "You see something broken, you fix it or find the person who can. Encord celebrates the people who solve 90% of a problem before anyone asks."}, {"title": "Builds with care and urgency", "description": "Encord bear-hugs the customer. Former founders and people from fast-moving, high-stakes environments thrive here."}, {"title": "Self-aware and hungry", "description": "The team stays warm, self-aware and genuinely hungry. People elevate their peers, and ego doesn''t last long."}, {"title": "Invents in real time", "description": "The team moves toward ambiguity: pragmatic, resourceful and energised by the fact that there''s no playbook."}]'::jsonb,
  '["Equity in a hyper-growth startup", "25 days paid time off", "Private health insurance", "Annual learning and development stipend", "Monthly team events and bi-annual offsites", "Team lunch twice a week", "Visa sponsorship, considered case by case for the role, level and location", "Payroll giving scheme", "Cycle to work scheme", "Home and tech scheme", "A strong in-person culture"]'::jsonb,
  'UK employees',
  'These are the benefits Encord lists for UK employees. Benefits in the US differ; your recruiter can walk you through the package for your location.',
  '["London", "San Francisco", "New York"]'::jsonb,
  'Encord describes a strong in-person culture. Each job posting lists its own location and work arrangement.',
  '["Recruiter screen", "Hiring manager conversation", "Skills-based interview or take-home", "Final panel"]'::jsonb,
  'The process varies by role and team, and is usually four or five stages in total. Your recruiter walks you through the specific steps at the start, so there are no surprises.',
  '[{"label": "Encord website", "url": "https://encord.com/"}, {"label": "Explore the product", "url": "https://encord.com/explore-product/"}, {"label": "Careers and open roles", "url": "https://encord.com/careers/"}, {"label": "Encord blog", "url": "https://encord.com/blog/"}, {"label": "Trust center", "url": "https://trust.encord.com/"}]'::jsonb,
  'From encord.com, October 2026.'
where exists (select 1 from public.jobs)
on conflict (id) do nothing;

update public.jobs set company_id = '56bdf318-ed70-5cd7-bd73-762c04d76a9c' where company_id is null;

-- A job inserted without a company belongs to the workspace's own company: the oldest one, the same rule
-- the backend applies (services/company_profile.py workspace_company_id). The backend always sets it; this
-- covers writers that predate this migration, such as a deployed backend still on the previous release,
-- so applying 017 first never breaks their job inserts. With no company at all, the insert fails on the
-- not-null constraint rather than inventing one.
create function public.jobs_default_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is null then
    select id into new.company_id from public.companies order by created_at, id limit 1;
  end if;
  return new;
end;
$$;

create trigger jobs_default_company
  before insert on public.jobs
  for each row execute function public.jobs_default_company();

alter table public.jobs alter column company_id set not null;
