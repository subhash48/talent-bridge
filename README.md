# Kavuntra

Kavuntra makes sure candidates never get forgotten during hiring. It catches communication gaps (a stage change nobody mentioned, a question with no reply, an interview with no follow-up), helps recruiters send personalized updates (AI drafts, the recruiter edits and approves), and gives every candidate a clear next step and interview preparation in their own portal.

**Status:** the native MVP, with three journeys on one product and one backend:

- **Candidates** apply on the careers site without an account (then create a password from the confirmation email), or sign up first, and follow every application in the candidate portal.
- **Recruiting teams** work in the full workspace, from **Today**: who needs an update, with a draft ready to review.
- **Small businesses** use **Simple Hire**: one big "What would you like to do?" button, plain words, and the same assistant underneath ("Post a kitchen job for Friday and Saturday evenings, $18 an hour").

Each employer is its own workspace, and none sees another's applicants. Every message an employer approves reaches the candidate's portal, and their inbox when email (Resend) is configured.

## Repository

- `frontend/` — Next.js app: the public website (`/`, `/for-recruiters`, `/for-small-businesses`, `/for-candidates`, `/about`, `/contact`, `/start`, `/privacy`, `/terms`), sign-in and sign-up (`/signin`, `/login`, `/signup`, `/signup/employer`, `/onboarding/workspace`), the careers site (`/careers`), the full recruiter workspace (`/recruiter`), Simple Hire (`/hire`) and the candidate portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: accounts and workspaces, jobs, candidates, applications, interviews, messages, communication (SLA rules, drafts, delivery, analytics), the assistants, the careers site, the website's contact form and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`021`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).
- `e2e/` — the three journeys end to end in a real browser ([e2e/README.md](e2e/README.md)).

## Quickstart

**Backend** (http://localhost:8000, API docs at http://localhost:8000/docs, health check at `/health`)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

With no `DATABASE_URL`, the API uses a local SQLite file (`backend/talent_bridge.db`) and loads the demo pipeline on first start, so nothing else is needed. Checks: `python -m pytest` and `ruff check app tests`. Or run it in Docker from the repository root: `docker compose up backend`.

**Frontend** (http://localhost:3000)

```bash
cd frontend && npm install && npm run dev
```

Signed out, `/` is the homepage; signed in, it opens your own workspace by role. **Recruiters** land on `/recruiter/today` (who needs an update), with `/recruiter/candidates` (the pipeline, with a Communication column), `/recruiter/jobs` (create, close and reopen jobs), `/recruiter/interviews` (with reminders to confirm), `/recruiter/messages`, `/recruiter/analytics` (communication analytics), `/recruiter/ai` (the assistant) and `/recruiter/settings` (communication rules, email delivery, what candidates see). **Candidates** apply at `/careers` and get a link to `/candidate`, whose home answers where they are, what happens next, whether they need to do anything and how to prepare; `/candidate/prep` has interview preparation and a mock interview.

Every data call goes through `frontend/services/*` to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). For UI work without the backend, set `NEXT_PUBLIC_USE_MOCK_API=true` to use seeded in-browser data (recruiter workspace only, with no sign-in; the candidate portal and the careers site always use the API). Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Supabase**

1. Apply `supabase/migrations/001`–`021` in order (`supabase db push --db-url "$DATABASE_URL"`, the SQL editor, or `supabase db reset` locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development)). Never edit a migration that has been applied; add the next number instead. `015` (communication) and `016` (careers résumés) only add tables; `017` adds employers; `018` adds `applications.candidate_messaging_enabled` (off by default, and on where the candidate had already written). The backend reads each new column, so apply a migration before deploying the code that needs it:
   - `019` makes each company a workspace: `companies.workspace_mode` (`full` or `simple`), `users.company_id` (the staff who exist today get the oldest company, the one `017` gave the jobs; candidates never have one) and per-workspace SLA rules (`communication_rules.company_id`).
   - `020` adds a small business's job facts (`jobs.pay`, `shift`, `work_days`, `openings`) and what each application says (`applications.phone`, `linkedin_url`, `availability`, `experience_note`); the phone number already on each person becomes their existing applications' own.
   - `021` adds `contact_requests`, for the website's contact form.

   Each one's backfill leaves `updated_at` as it was, and `e2e/make_db.py` applies them all to an empty database on every end-to-end run.
2. Set `DATABASE_URL` in `backend/.env` to the project's connection string (direct or pooler), replacing `[YOUR-PASSWORD]` including the brackets.
3. Load the demo data: `python -m app.db.seed` (or `--reset` to replace existing data). The API also loads it into an empty database on startup while `SEED_DEMO_DATA=true`. A database seeded before newer demo data was added gets just the rows it's missing with `--add-missing`, which never changes or deletes what's there.

Row-level security is on with no policies: the browser only talks to the API, which connects as the database owner.

## Sign-in

Supabase Auth (email and password, or a one-time link by email) proves who someone is; the API decides what they may do. The frontend sends the session's access token as `Authorization: Bearer` on every API call (`frontend/services/api.ts`), and the API verifies it against the project's public signing keys (signature, issuer, audience, expiry) before loading the `users` row it's linked to (`users.auth_user_id`). **The role on that row is the only source of access**: nothing the browser sends, and nothing in the token's metadata, can change it.

- **Recruiters and admins** hire for one company, their workspace (`users.company_id`), and use the staff endpoints for it only: `/recruiter` in a full workspace, `/hire` in Simple Hire. An employer can create a new, empty workspace for their company and become its admin (below); nobody can join an existing one from the website.
- **Candidates** use `/candidate` and `/api/v1/candidate/*` only, always scoped to their own record (`candidates.user_id`); the API never takes a candidate id from the browser.
- No token or an invalid one is `401`; a valid token without a linked account, or with the wrong role, is `403`. `users.disabled_at` revokes access immediately.

Pages: `/signin` asks "How are you using Kavuntra?" and leads to `/login?as=candidate` or `/login?as=employer`; `/signup` (candidates), `/signup/employer` and `/onboarding/workspace` (employers), `/forgot-password`, `/reset-password`, `/auth/confirm`, where Supabase's confirmation and reset emails land, `/auth/callback`, where portal invitations and activation links land, and `/welcome`, where an applicant creates their Kavuntra password (or skips it: "Email me a sign-in link" on `/login` always works). Passwords only ever go to Supabase Auth: the API never receives or stores one.

**Configure** (values from Project Settings > API):

- `backend/.env`: `SUPABASE_URL=https://<project-ref>.supabase.co`. No secret key is needed.
- `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` (the same URL) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`). Never put a secret or service role key in a `NEXT_PUBLIC_` variable.
- In the dashboard, under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the Redirect URLs, so confirmation and reset links can return to `/auth/confirm` and invitations to `/auth/callback`. Keep **Confirm email** on (the default).

**Demo accounts.** The demo data has Alex Chen (recruiter), Sophia Martinez (candidate, applications at four companies: Encord, OpenAI, Anthropic and Google) and Rosa Navarro (candidate, applications at three companies: Encord, and the fictional Nova AI and Harbor Robotics, so the portal shows its application selector) but no sign-ins. The OpenAI, Anthropic and Google profiles hold only each company's own public description and links, their recruiters are fictional (`.example` addresses), and their jobs are drafts, so the public careers site never lists them. To give each one:

1. In the Supabase dashboard, open Authentication > Users > Add user > Create new user. Enter `alex.chen@encord.example` and a password of your choice, and tick **Auto Confirm User**. Do the same for `sophia.martinez@example.com`, `rosa.navarro@example.com` and `sam@samscafe.example`. Keep the passwords out of git.
2. Link each account to its person (from `backend/`):

   ```bash
   python -m app.db.accounts link alex.chen@encord.example      # Alex Chen, recruiter
   python -m app.db.accounts link sophia.martinez@example.com   # Sophia Martinez, candidate at four companies
   python -m app.db.accounts link rosa.navarro@example.com      # Rosa Navarro, candidate at three companies
   python -m app.db.accounts link sam@samscafe.example          # Sam Rivera, Sam's Cafe (Simple Hire), admin
   python -m app.db.accounts list                               # who can sign in
   ```

Linking never sets a role: Alex keeps the recruiter role the `users` row has, Sam the admin role, and Sophia's existing candidate record gets a candidate `users` row tied to it. To add another recruiter or an admin, insert their `users` row (with `role`) in the database first, then create and link their account the same way. Resetting the demo data (`POST /api/v1/demo/reset`) keeps these links.

**Trying the three journeys** (local demo data only; none of it is in production logic). A database seeded before Sam's Cafe was added gets it, and nothing else changes, with `python -m app.db.seed --add-missing`.

- **Alex Chen, recruiting team** (`alex.chen@encord.example`): Sign in > Employer / Recruiter. Alex lands on `/recruiter/today` in Encord's full workspace (Today, Candidates, Jobs, Interviews, Messages, Analytics, AI Assistant, Settings) and sees only Encord's pipeline, never Sam's Cafe's applicants.
- **Sophia Martinez, candidate** (`sophia.martinez@example.com`): Sign in > Candidate. The portal shows every application, at four employers. Applying to another job on `/careers` with the same email adds it to the same account; nothing asks for a new one.
- **Sam Rivera, Sam's Cafe** (`sam@samscafe.example`): Sign in > Employer / Recruiter. Sam lands on `/hire`, Simple Hire, with a Kitchen Assistant job and five applicants (Maria Lopez, John Patel, Amina Yusuf, Tom Becker, Lena Park). Then:
  1. Press the big button and say or type "Post a cashier job paying $16 an hour for weekend shifts.", check the Ready to post card, and press **Post Job**.
  2. Have six fictional people apply to it the way real applicants do (from `backend/`; refuses to run with `ENVIRONMENT=production`): `python -m app.db.demo_applicants "Cashier" --company sams-cafe`
  3. "Show me 3 applicants available weekends with customer service experience." Tick the three, then "Show me their phone numbers."
  4. "Ask them if they can come in Tuesday afternoon." Read the requests, then **Send**: three messages and three interview records, and no calendar claimed.
- **A new candidate**: `/signup` with first and last name; verify the email; the portal opens. **Applying first**: apply to a job on `/careers` with a new email, open the emailed link, and create a password at `/welcome`.

`e2e/` runs all of this in a browser against its own stack ([e2e/README.md](e2e/README.md)).

**Candidate sign-up** (`/signup`): first and last name, email, and a password typed twice (at least 8 characters, letters and a number, not a common one and not the email's name; `frontend/lib/password.ts`). Supabase emails a verification link; opening it lands on `/signup/complete`, which creates the candidate account (`POST /api/v1/accounts/candidate`) and opens the portal. If they had already applied with that email, anywhere, that candidate record becomes theirs with every application on it; otherwise they start with none. Sign-up never creates an application. Nothing is created before the email is verified (403 `email_not_verified`).

**Applying first.** Someone who applies on the careers site without an account gets one email with a one-time link to create their password (see Careers site); `/welcome` takes the password twice, and their application is in the portal. Applying again later with the same email, at the same employer or another, never makes a second account: they get a sign-in link instead, and every application is in the one portal.

**Employer sign-up** (`/signup/employer`, from "Create company workspace" or "Simple Hire" on the website): their name, work email and a password; after verifying, `/onboarding/workspace` asks "Which best describes you?" (a recruiting team or growing company, or a small business hiring simply) and the company's name and location, then creates the workspace (`POST /api/v1/accounts/workspace`) in that mode with them as its admin. An admin can switch the mode later in Settings.

**Accounts are never mixed.** One email is one kind of account: an employer's address can't become a candidate account (409 `staff_email`) and a candidate's can't create a workspace (409 `candidate_email`). Signing in as an employer with a candidate account, or the other way round, signs them out with "This is a candidate account. Use candidate sign in…" and a link to the right page. Someone who verified but never finished setting up is sent back to finish.

**Email templates** (Supabase dashboard, Authentication > Emails). The defaults work. Two changes help:

- **Confirm signup**: the default link must be opened in the browser that signed up. For one that works anywhere, link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (`/auth/confirm` accepts both).
- **Invite user**: without an email provider, an applicant's activation link comes in this email, so word it for them: "Your application has been submitted. Create your Kavuntra password to follow updates from the hiring team." With Resend set up, Kavuntra sends its own confirmation with the link instead, and Supabase sends nothing.

## Workspaces

Each employer is a workspace: its company (`companies`), the people who hire for it (`users.company_id`), its jobs, and the applications to them with everything kept per application (messages, interviews, timeline, drafts, résumés sent with it). One backend and one database serve every workspace; nothing is copied per employer.

**Isolation** (`backend/app/core/tenancy.py`). Every recruiter request runs in a database session scoped to the recruiter's own company before the route runs (`require_workspace`). From then on every ORM read, and every bulk UPDATE or DELETE, sees only that workspace's rows, however the query is written: another employer's job, application, candidate or message isn't there, so a list leaves it out and its id answers 404. A lookup that has to see across workspaces says so in the statement, and only for checks that tell nothing about another employer. `backend/tests/test_workspaces.py` requests every recruiter route as another employer and checks nothing leaks.

**One person, many employers.** Someone who applies to two employers is one candidate record and one sign-in, with both applications in their portal. Each employer sees only its own application and what was given with it: the phone number, availability, experience and LinkedIn from that application, and the résumé sent with it, never what the person gave another employer. Recruiters' private notes, interviewer feedback, internal stages and rejection reasons never reach the candidate, and demographic answers are never used to find or order anyone.

**How a workspace hires** (`companies.workspace_mode`): `full` is the recruiting team's workspace at `/recruiter`; `simple` is Simple Hire at `/hire`. The data and services are the same; only the interface differs. Signing in opens the one the company uses, and each sends the other's users to the right place. An admin switches it in Settings (`PATCH /api/v1/workspace`); recruiters see it read-only.

The Ashby integration is connected for one employer, the deployment's own company (the oldest): only its staff see its status or run a sync.

## Ashby (optional)

Kavuntra runs on its own (jobs, the careers site, applications, interviews and messages). The Ashby integration from before the refocus still works, but it isn't being developed in this phase. When connected, Ashby is the system of record; Kavuntra syncs what it needs and adds the candidate portal and communication on top. Code: `backend/app/integrations/ashby/`.

**1. API key** (Ashby Admin > Integrations > API keys). Give it `candidatesRead`, `jobsRead` and `interviewsRead` (read-only; Kavuntra never writes to Ashby). Put it in `backend/.env` as `ASHBY_API_KEY`. `GET /api/v1/integrations/ashby/status?check=true` (or Settings in the recruiter workspace) confirms it works; a missing permission is reported by name.

**2. Webhooks** (Ashby Admin > Integrations > Webhooks > New webhook), one per event type, all with:

- Request URL: `https://<your-backend>/api/v1/integrations/ashby/webhook`. Ashby must reach it over the internet: deploy the backend, or tunnel to your machine (`ngrok http 8000` or `cloudflared tunnel --url http://localhost:8000`) and use that URL.
- Secret token: a long random string, also set as `ASHBY_WEBHOOK_SECRET` in `backend/.env`. Every delivery is verified against its `Ashby-Signature` (HMAC-SHA256 of the body); anything unsigned or wrongly signed gets 401.
- Events: `applicationSubmit`, `applicationUpdate`, `candidateStageChange`, `candidateHire`, `interviewScheduleCreate`, `interviewScheduleUpdate`, and optionally `jobCreate`, `jobUpdate` (closed jobs) and `candidateMerge`. Other events are acknowledged and ignored.

Ashby pings the URL when you save; it must answer 200 or the webhook is created disabled. Redelivered events are applied once (each is recorded under its `webhookActionId` and action), an older event never overwrites a newer one (by Ashby's `updatedAt`), and a failed one returns 5xx so Ashby retries it.

**3. Reconciliation sync.** Webhooks miss things (events from before they were set up, bulk imports, long outages), so sync regularly; it only fetches what changed since the last run and never duplicates anything:

```bash
python -m app.integrations.ashby.sync            # from backend/; --full to refetch everything
```

or the recruiter Settings page's **Sync now** (`POST /api/v1/integrations/ashby/sync`). A daily cron is plenty.

**Stages.** Ashby stages map by their type (pre-interview screen > Screening, active > Interview, offer > Offer, hired > Hired). Map custom stage titles with `ASHBY_STAGE_TITLE_MAP='{"Take-home": "screening"}'`. Ashby's own stage, status and archive reason *type* are kept on the application; the reason's text never is. In the candidate portal an application is **Active**, **No longer under consideration** (rejected by the team) or **Inactive** (withdrawn, hired, or the role closed). The tables live in `integrations/ashby/mapping.py` and `services/candidate_visibility.py`.

**Candidate portal invitations.** Applying through Ashby gives the candidate portal access at the email they applied with. If they already have a Kavuntra sign-in it's reused, never duplicated; otherwise Supabase emails them an invitation and they choose their own password (no password is ever generated, stored or sent). One person with several applications has one account. This needs, in `backend/.env`, `SUPABASE_SECRET_KEY` (Project Settings > API: the secret or service role key; server-side only, never in the frontend), and in Supabase, your frontend's `/**` in Authentication > URL Configuration > Redirect URLs (already there for sign-up).

Supabase's default **Invite user** email works as it is, so no custom SMTP or template is needed:

1. Its **Accept the invite** link opens Supabase's own `/auth/v1/verify`.
2. That checks the one-time token, then redirects to `<FRONTEND_URL>/auth/callback?next=/welcome` with the new session in the URL fragment (`#access_token=…&refresh_token=…&type=invite`).
3. `/auth/callback` takes the tokens out of the address bar, has Supabase check them, and opens `/welcome`.
4. On `/welcome` the candidate sees the address the account is for and chooses their password, then lands in `/candidate`.

An expired or already-used link shows "This link has expired or was already used" with sign-in and new-link options. Optionally, once custom SMTP lets you edit templates, you can point the invite link at `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite`. That works in any browser and keeps tokens out of the URL entirely, because `/auth/callback` hands it to the server route `/auth/confirm`.

A failed invitation never affects the import: the candidate shows "Invitation failed" to recruiters with a retry button, and the sync retries automatically. The reconciliation sync only invites people who applied in the last 14 days (`ASHBY_SYNC_INVITE_MAX_AGE_DAYS`), so a first sync never emails a backlog. Recruiters can also invite anyone from the Communication card on the candidate's page.

**Trying it without an Ashby account (development only).** A simulator builds the webhooks Ashby would send from the test fixtures and runs them through the same webhook processor, importer, stage mapping and portal provisioning as real ones. It has no HTTP endpoint of its own (only the demo careers site below uses it from the API) and refuses to run when `ENVIRONMENT=production`. From `backend/`:

```bash
python -m app.integrations.ashby.demo apply --email testcandidate1@example.com --first-name Maya --last-name Patel --job "TEST - ML Engineer"
python -m app.integrations.ashby.demo stage --email testcandidate1@example.com --stage interview   # screening, offer, hired, rejected, withdrawn
python -m app.integrations.ashby.demo interview --email testcandidate1@example.com                 # --in-days N, at 16:00 UTC
python -m app.integrations.ashby.demo status
python -m app.integrations.ashby.demo reset                                                         # deletes only what the simulator and the demo careers site made
```

It writes to the database in `DATABASE_URL` and prints which one first. Its records carry `tb-demo-` Ashby ids, and `reset` deletes only those and the applications made on the demo careers site (Supabase Auth accounts are never touched). Rerunning `apply` counts as a redelivery, so nothing is created twice. It won't use an email that belongs to anyone outside the simulator. No invitation email is sent unless you add `--send-invite`, which only works for addresses that can receive mail. To open the candidate portal as the demo candidate, either use `--send-invite` with an address you own and accept the email, or add the user in Supabase (Authentication > Users > Add user, auto-confirmed) and run `python -m app.db.accounts link <email>`. Then sign in at `/login`.

### Demo careers site (development only)

Recruiters can post made-up demo jobs on a public careers page, and anyone can apply to them there. Each application then reaches Kavuntra through the simulator above, as a real Ashby application would. It writes to the database in `DATABASE_URL` and sends real Supabase invitations, so turn it on only with a development database.

**Turn it on.**

1. Apply migration `013`. It only adds tables.
2. Set `ENABLE_ASHBY_DEMO=true` in `backend/.env`. It's ignored when `ENVIRONMENT=production`: there, as whenever it's off, every demo route answers 404.
3. Run the API from a source checkout (`uvicorn` from `backend/`, as in the quickstart), not the Docker image. The simulator builds its webhooks from `backend/tests`, which the image doesn't include; without those files the careers site still lists roles, but nobody can apply.
4. Set up portal invitations as for Ashby applicants (above): `SUPABASE_SECRET_KEY`, and your frontend's `/**` in the Redirect URLs. Supabase's default **Invite user** email works as it is.

The frontend needs no setting of its own: the demo shows up when the API has it on (never in mock mode), and from then on everything happens in the browser.

**Recruiters.** On `/recruiter/jobs`, **+ Create Demo Job** opens the editor. Fill in the basics (job title, department, location, work arrangement, employment type, seniority, skills, and short notes for the AI, which never appear on the careers site), then click **Generate with AI**. The AI provider in `backend/.env` (Groq with `AI_PROVIDER=groq` and `GROQ_API_KEY`) drafts the summary, about the role, responsibilities, requirements, preferred qualifications, skills and about the team. Without a provider, or when it fails, a template writes the draft, and the editor says so. Lines that mention personal characteristics, such as age or nationality, are left out. Edit anything, then **Save Draft** or **Publish Demo Job**. Nothing is published until you click it, and publishing needs a summary, a description of the role, and at least one responsibility and one requirement.

The **Demo jobs** section of the Jobs page shows each demo job's status, applicants and publish date, with **Edit**, **Publish**, **Unpublish** (off the careers site; the job stays open for whoever applied), **Close** (off the site and no new applications; existing ones stay, and the candidate portal shows them as "Role closed") and **View public page**. A demo job is an ordinary job too, with its pipeline at `/recruiter/jobs/[id]`.

**Applicants.** `/demo/careers` lists the published demo jobs; no sign-in is needed. Each role's **Apply for this role** opens a form for first and last name, email, phone number, a résumé (PDF, DOC or DOCX, up to 5 MB) and optionally a LinkedIn URL. The résumé is stored privately in the database. The email has to be one that can receive mail (`example.com` and the like are refused) and can't be a staff member's.

**After applying.** The application waits, and recruiters see nothing of it beyond "N awaiting activation" in the demo job's applicants, until the applicant proves they own the email:

- A new email gets a candidate portal invitation. Accepting it opens `/welcome`, where they choose a password.
- An email that already has an account is asked to sign in with it instead. No second account is made.

Either way, the `GET /me` that follows (from `/welcome`, the sign-in page or the portal) submits every application waiting for that email through the Ashby simulator. The same webhook processor and importer as a real Ashby application create the application, and the candidate if they're new, with the source "Ashby Simulator / Demo Careers", at Screening. The sign-in is linked to the candidate, recruiters see them with their phone, résumé and source, and the candidate portal shows the application. An application waits 24 hours: after that, signing in no longer submits it until they apply again.

**Several jobs.** One email is one candidate and one portal account, with one application per role. One invitation covers every role applied for while its link is valid (an hour, Supabase's default); after that, applying again sends a new one. If the email belongs to someone already in Kavuntra, the application joins their record without changing their name, phone or a résumé link the hiring team set, and for a role they're already in the pipeline for, the existing application stands.

**Supabase.** Keep **Confirm email** on. With it off, Supabase signs anyone straight in as whatever address they sign up with, so an invitation proves nothing. Its built-in email service also sends only a few emails an hour for the whole project; past that, applying says "Your application is saved" with **Try again**. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) raises the limit.

**Reset.** `python -m app.integrations.ashby.demo reset` also deletes the demo jobs with their postings, and every application made on the careers site, pending or submitted, with its résumé. Demo jobs that have applications from outside the simulator are kept, and so is anyone who was in Kavuntra before applying: only their careers applications go.

## Candidate communication

The core of Kavuntra (`backend/app/services/communication/`, migration `015`).

**SLA rules.** Each application is checked against five rules; a recruiter can switch each off or change its threshold in Settings (`GET`/`PUT /api/v1/communication/rules`):

| Rule | Default | Clears when |
|---|---|---|
| Status changed, candidate not told | right away | the candidate gets a message |
| Unanswered message (not a thank-you note) | 24 hours | someone replies |
| Interview done, no follow-up | 72 hours after it ends | the candidate gets a message |
| Interview not confirmed | 24 hours before it | they confirm, or get a reminder in that window |
| No update in a while (active, no interview booked) | 5 days | the candidate gets a message |

An update is any message the candidate received from the hiring team. Archived applications owe nothing; hired and rejected ones are flagged only for the last 30 days. `GET /communication/attention` is **Today**; each pipeline row has a communication summary and the candidate page a **Communication** card (the internal stage next to the status the candidate sees, their last update, unanswered messages, interview confirmation, post-interview follow-up and portal access).

**Drafts.** `POST /communication/drafts` writes an update for the rule that needs attention (a stage-change update, and for a rejection a kind note that never gives a reason; a reply; a post-interview follow-up; a reminder to confirm; a status update). The recruiter edits it (`PATCH`), then approves and sends it (`POST …/send`, once: a second send is a 409) or discards it. Nothing is ever sent automatically. Drafts to candidates get a candidate-safe context: no interviewer feedback, no recruiter's free text from the timeline, no internal activity.

**Candidate messaging.** A candidate can always read what the hiring team sends, but can only write to them about an application once a recruiter turns messaging on for it (`applications.candidate_messaging_enabled`): from the candidate's ⋮ menu or actions, the Messages inbox ("Replies on/off"), or for the candidates ticked on the Candidates page (`PUT /applications/{id}/messaging`, `POST /applications/messaging`). While it's off, the portal shows the thread with "Messaging will become available when the hiring team enables it." instead of the composer, and `POST /candidate/messages` answers 403 `messaging_disabled`. Turning it on for one application never opens another, even for the same person. A message, invitation or outreach from the AI Assistant offers to turn it on (ticked by default) once it's sent, so a candidate asked to reply can; left off, drafts don't ask them to reply, and the email footer and portal only mention replying where it's on.

**Delivery.** Every recruiter message, from Today, the candidate page, the inbox or the assistant, goes the same way (`message_service.send_message`): to the candidate portal and the timeline (the audit entry) at once, with a delivery record; then by email when `RESEND_API_KEY` and `EMAIL_FROM` are set (a sender on a domain verified in Resend). Each message shows whether it was emailed, failed (with the reason) or reached the portal only; a failed email never unsends the portal message. Without Resend, everything still works and the workspace says that email isn't set up.

**Analytics.** `/recruiter/analytics` (`GET /communication/analytics?days=30`): candidates needing an update now, median time between updates (counting silences still going on), updates sent on time per rule, interview confirmation rate, unanswered messages, updates and emails sent, AI drafts generated, sent as written or edited, and discarded, and an estimate of recruiter time saved (5 minutes per AI draft sent; the assumption is shown).

## Finding candidates and reaching out

`/recruiter/candidates` lists every active application (the workspace reads every page of `GET /candidates`, not just the first). Search matches name, job, employer, stage, skills, location and email; **Filters** has job, skills (every one ticked), location, application date, interview status (booked, interviewed, interviewed with no update since, none yet), communication, candidate messaging and portal. Every filter in force shows under the stage chips with its own ×, and a link can carry them (`?job=…&skills=Figma|Design systems&stage=…`).

**Shortlist** asks for job-related criteria (skills or requirements; with a job filter and none typed, the job's own listed requirements) and how many to show (5, 10, 20 or a custom number). `POST /candidates/match` (`backend/app/services/candidate_matching.py`) orders the candidates in view by how many criteria their application shows, then the earliest application, and each row says why: ✓ for each criterion found, with where (listed skills, headline or résumé), and stated experience such as "4 years product design experience", quoted (only years said as experience in a sentence about that kind of work, never an age or time away). There are no scores, nothing personal (demographics, pronouns, portal activity, engagement) is read, a criterion naming a personal characteristic (gender, age, religion, national origin, family status and the like; `services/personal_characteristics.py`) is refused, and nobody is moved or rejected: the recruiter ticks who to act on.

With candidates ticked, the bulk bar moves them, turns candidate messaging on or off, or **Draft personalized outreach**: one draft per ticked candidate (an interview invitation or a message), optionally with interview times proposed back to back in a window. Each can be reviewed and edited or left out; "Approve selected" shows one final look at the candidates, messages and times, and only "Confirm & send" sends the messages (through the one send path) and creates the interviews in Kavuntra. Each candidate's outcome is reported, such as "Portal delivered — Email not configured" and "Interview created in Kavuntra — Calendar invite not sent".

**Calendars and video.** Interviews go to a calendar provider (`backend/app/integrations/calendar.py`) as events. None is connected, so no invitation is claimed and the workspace says "Calendar integration required to create real calendar events."; Google Calendar or Microsoft Outlook plug in there as another provider. No video meeting link is ever invented: only one the recruiter types is used. Proposed times use the browser's named time zone, so a day after a clock change gets that day's offset.

A candidate's panel and page have Application, Interviews, Messages, Activity and Communication tabs and four actions: Message, Draft with AI, Schedule interview, and Enable or Disable candidate messaging. Someone with several applications is asked which one to act on first, and every action applies to that application only.

## Simple Hire

`/hire` is for small businesses that don't want recruiting software: Home, Jobs, Applicants and Messages (a bottom bar on phones), and Settings from the menu. No pipelines, stages, SLAs or analytics. Home asks "What would you like to do?" with one large button to talk to Kavuntra (typed, or spoken with the microphone) and four big choices: **Post a job**, **See applicants**, **Contact candidates** and **Schedule interview**. Every request goes through the same assistant engine as the full workspace (`backend/app/services/assistant/`), read the same way typed or spoken (`simple.py`), and answered in plain words.

- **Posting a job.** "I need two workers for my restaurant. Evening shift, $18 an hour. They should have kitchen experience and be available Friday and Saturday." becomes a **Ready to post** card: Kitchen Assistant (marked as a suggestion, since it wasn't said), $18/hour, Evening shift, Friday + Saturday, 2 openings, kitchen experience, with **Post Job** and **Edit** (a short form, not a big one). Nothing is written by AI into it, and nothing is posted until Post Job. "Make it $19 an hour" changes the same card.
- **Finding applicants.** "Show me 3 applicants with kitchen experience who are available Friday and Saturday." lists people who applied to this business, each with visible reasons (✓ Kitchen experience, ✓ Friday available, or what's missing), from what they wrote and the days they said they can work. No scores and no ranking, and nothing personal is read.
- **Phone numbers.** "Show me their phone numbers." shows the name, number and job of the ticked applicants: only numbers people gave this business when they applied to it. Kavuntra never looks anyone up anywhere else, and says so if asked to.
- **Messages and interviews.** "Message these three." or "Ask them if they can come in Tuesday between 2 and 5." drafts one message each to read, change or leave out; **Send** sends exactly what's shown. Interview requests get a time each in the window and an interview record in Kavuntra. No calendar is connected, so none is claimed; whoever doesn't fit is asked when they can come instead.

## Careers site

`/careers` lists the open jobs made in Kavuntra (`/recruiter/jobs` → **Create job**, or Post Job in Simple Hire), with a small business's pay, shift, days and openings. Applying takes first and last name, email, phone, an optional LinkedIn profile and a résumé (PDF, DOC or DOCX, up to 5 MB), and what the job asks: the days they can work, for a job with set days, and their experience in their own words. **No account and no password.** The application is created at once, at Applied with the source "Careers site", and the employer sees it with the résumé (`GET /resumes/{id}`, its staff only) and what was given with it.

The applicant gets one email that confirms the application and carries a one-time link: to create their Kavuntra password for a new account, or to sign in for an existing one. With Resend set up, Kavuntra sends it ("Your application has been submitted. Create your Kavuntra password to follow updates from the hiring team."); without it, Supabase sends its own invitation or sign-in email. Both need `SUPABASE_SECRET_KEY`. Applying again adds nothing and sends a fresh sign-in link (at most three an hour to one inbox), the same email at another employer adds that application to the same account, and an email that can't be sent never undoes the application. One address can apply ten times in ten minutes before being asked to wait. API: `GET /careers/jobs`, `GET /careers/jobs/{id}`, `POST /careers/jobs/{id}/apply`, all public.

## Website

The homepage (`/`) is told inside a scroll-played film of a valley: 40 frames (`frontend/public/hero/`, WebP at quality 85, the source's full 1920×1080 for landscape screens and its 608×1080 centre crop for portrait ones, made from the source frames with ffmpeg and never upscaled) drawn on one fixed canvas at the screen's own pixel density (up to 2×) behind the whole page, closing in as the page scrolls, its sky toned soft blue by a colour blend that keeps every pixel's brightness (nothing white, cream or lavender is laid over the film). Over it one pinned screen shows eight scenes in turn (`components/site/hero/FilmStage.tsx`, content in `components/site/home/scenes.tsx`): the opening (**Hiring feels simpler.**), three one-line statements, then **One hiring experience. Two sides.**, recruiters, candidates and Simple Hire, each with its words in the sky and a small frosted picture of the product over the meadow; `/#product`, `/#recruiters`, `/#candidates` and `/#small-business` land on theirs. Scene timing and frame maths are in `lib/scroll-frames.ts`. Only the first six frames load before the visitor scrolls (and only once the page is idle), the rest nearest-first, and only the frames around the one on screen are decoded at a time. Reduced motion or data saver shows one still frame behind the scenes, laid out one after another. The footer floats over the film's last frames. The header is a small floating pill: Product, a Solutions menu (For Recruiters, For Candidates, For Small Businesses), About, Careers and Contact, then Sign in and Get started; under 1024px it folds into one menu. The longer pages are `/product`, `/for-recruiters`, `/for-small-businesses`, `/for-candidates`, `/about`, `/about/careers` (working at Kavuntra: `/careers` stays the job board, the open roles of the companies hiring with it) and `/contact`, on the same sky as a quiet backdrop; **Get started** (`/start`) is one still of the valley with three glass cards: Candidate, Recruiter or Small Business. Nothing on the site makes claims about customers, revenue or funding. `/privacy` and `/terms` are placeholder pages that say they aren't legal advice; replace them before launch.

**Contact form** (`/contact`, `POST /api/v1/contact`): full name, email, optional company, inquiry type (General inquiry, Product questions, Product support, Partnership, Pilot program: the same five topics the table allows) and message. Every message is kept (`contact_requests`); with Resend and `CONTACT_EMAIL` set it's also emailed there, and the site shows that address. Without them no address is shown, and `python -m app.db.contact_requests` (`--not-emailed` for those still waiting) prints them. A hidden field turns away form fillers, and one address can send five in ten minutes.

## Candidate portal and preparation

The portal home opens on **My applications**: one card per application (the employer's logo and name, the role and the candidate-safe stage), in a row that scrolls sideways, with arrows on wider screens, touch on phones and a search by company or role. The chosen card is the application the whole portal shows (dashboard, applications, interviews, messages, company, Ask AI and preparation), read through application → job → company; the sidebar's switcher and opening another application's interview change it too, and it's remembered while the candidate moves around. Below the cards, the home answers four questions about that application from the portal's candidate-safe record: **Where am I** (the plain status), **What happens next**, **Do I need to do anything** (confirm an interview, read new messages, review an offer, or nothing) and **How should I prepare**, with the last update from the hiring team. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns internal notes, interviewer feedback, scores, rejection reasons or the hiring team's internal stage names.

Preparation (`/candidate/prep`) opens once the candidate is invited to interview and draws on the job posting, the profile that application's employer approved (the `companies` table, read through application → job → company; `services/company_profile.py`), the interview being prepared for (`?interview=` makes its application the portal's context) and the candidate's own résumé (its text is read from PDF and DOCX at upload): what to expect, role focus, topics, questions to ask, practice questions and **From your résumé**, the experiences worth having a story ready about. The **mock interview** asks one practice question at a time and gives a few coaching points on the typed answer; nothing is stored or shared, and it never scores. Ask AI answers from the same candidate-safe record and nothing else. How candidates use the portal isn't recorded.

## AI Assistant

`/recruiter/ai` is one assistant for typed and spoken requests, through one action engine (`POST /api/v1/assistant/requests`, `backend/app/services/assistant/`): speech → text → one structured action (the hosted model, or the offline rules in `rules.py`) → the existing services → a preview → explicit approval → execution. It handles:

- **Communication:** "Who needs an update today?", "Which candidates have unanswered questions?", "Which interviews need confirmation?", "Who interviewed this week and hasn't had a follow-up?", "Draft Sarah an update" (through the drafts ledger), "Send Sophia an interview invitation for next Tuesday", and questions about one candidate's application or next interview.
- **Jobs:** "Create a Senior Product Designer role in New York, hybrid, requiring Figma, design systems and user research" writes an **AI Job Draft** with the AI job writer: no job exists yet. Anything not said (salary, department) is left empty and flagged. "Add Kubernetes and model monitoring" changes the same draft, "Looks good" asks "Create this job?", and "Yes", "Approve" or the Approve & Create button creates it, open on the careers site.
- **Candidates:** "Show applicants for that role", "Filter for candidates with Python, PyTorch and AWS", "Show 10 matching", "Show candidates currently in screening" and "Show candidates who interviewed but haven't received an update" become visible filters and criteria, kept as the conversation narrows the list. Each candidate shows the evidence, and the list links to the same view on the Candidates page. "The top 10 for the ML Engineer role" is answered as a search on the job's listed requirements, saying it isn't a ranking.
- **Outreach:** the recruiter ticks candidates (or says "Select Sophia, Maya and James"). "Draft interview invitations for the selected candidates" writes one personal draft each, and "Make these 30-minute interviews next Tuesday afternoon" proposes the times and rewrites each draft to name its own. "Send them" shows one final confirmation of the candidates, messages and times, and only "yes" (or Confirm & send) runs it, once. What the recruiter changed on the card (who's unticked, edited messages, replies on or off, the job's fields) goes with every request, so a typed or spoken "yes" approves exactly what they see. Approval is a plain "yes": "Okay, remove James first" unticks him, "Perfect, but make them Wednesday morning" proposes new times, "No" or "not yet" leaves it waiting, and "don't…" never does what it says not to.

Names are matched against the active pipeline and never guessed: someone with several applications, like Sophia, gets "Which one?" with each role and employer, unless the request comes from one application's page. Every proposal runs exactly once.

The AI never evaluates, scores, ranks or rejects candidates, lists strengths or concerns, judges culture fit or recommends a hiring decision; those requests are declined, and searches use only job-related criteria. **Voice** stays inside the assistant (the microphone beside Send): the recording is transcribed (Groq Whisper with `AI_PROVIDER=groq`, else the browser's own recognition) and never stored. It takes exactly the same path as typed text, so a first spoken "send it" or "looks good" only shows the final confirmation.

All `/assistant/*` routes check the recruiter role on the server; a candidate's token gets 403.

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase project URL and secret key (portal invitations and sign-in links), AI provider (`mock`, `gemini` or `groq`) and keys, `RESEND_API_KEY` and `EMAIL_FROM` (email delivery; optional), `CONTACT_EMAIL` (the address the website shows and its contact form emails), Ashby keys and options, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL, the Supabase URL and publishable key, and the mock-mode switch. Only public values belong here.

Never commit real secrets.

**Checks.** Backend: `python -m pytest` (in-memory SQLite; set `TALENT_BRIDGE_TEST_POSTGRES_URL` to a throwaway Postgres to run them there too, including the migration tests) and `ruff check app tests`. Frontend: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. End to end: `bash e2e/run.sh` ([e2e/README.md](e2e/README.md)).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); section 24 describes the communication refocus.
