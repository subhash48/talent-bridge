# TalentBridge

TalentBridge makes sure candidates never get forgotten during hiring. It catches communication gaps (a stage change nobody mentioned, a question with no reply, an interview with no follow-up), helps recruiters send personalized updates (AI drafts, the recruiter edits and approves), and gives every candidate a clear next step and interview preparation in their own portal.

**Status:** the native MVP. Companies create jobs, candidates apply on the careers site without an account and follow everything in the candidate portal, and recruiters work from **Today**: who needs an update, with a draft ready to review. Every message a recruiter approves reaches the candidate's portal, and their inbox when email (Resend) is configured.

## Repository

- `frontend/` — Next.js app: the homepage (`/`), the careers site (`/careers`), the recruiter workspace (`/recruiter`) and the candidate portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: jobs, candidates, applications, interviews, messages, communication (SLA rules, drafts, delivery, analytics), the assistants, the careers site and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`016`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).

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

1. Apply `supabase/migrations/001`–`016` in order (`supabase db push --db-url "$DATABASE_URL"`, the SQL editor, or `supabase db reset` locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development)). Never edit a migration that has been applied; add the next number instead. `015` (communication) and `016` (careers résumés) only add tables.
2. Set `DATABASE_URL` in `backend/.env` to the project's connection string (direct or pooler), replacing `[YOUR-PASSWORD]` including the brackets.
3. Load the demo data: `python -m app.db.seed` (or `--reset` to replace existing data). The API also loads it into an empty database on startup while `SEED_DEMO_DATA=true`.

Row-level security is on with no policies: the browser only talks to the API, which connects as the database owner.

## Sign-in

Supabase Auth (email and password, or a one-time link by email) proves who someone is; the API decides what they may do. The frontend sends the session's access token as `Authorization: Bearer` on every API call (`frontend/services/api.ts`), and the API verifies it against the project's public signing keys (signature, issuer, audience, expiry) before loading the `users` row it's linked to (`users.auth_user_id`). **The role on that row is the only source of access**: nothing the browser sends, and nothing in the token's metadata, can change it.

- **Recruiters and admins** use `/recruiter` and every staff endpoint. There is no public sign-up for them.
- **Candidates** use `/candidate` and `/api/v1/candidate/*` only, always scoped to their own record (`candidates.user_id`); the API never takes a candidate id from the browser.
- No token or an invalid one is `401`; a valid token without a linked account, or with the wrong role, is `403`. `users.disabled_at` revokes access immediately.

Pages: `/login`, `/signup` (candidates), `/forgot-password`, `/reset-password`, `/auth/confirm`, where Supabase's confirmation and reset emails land, `/auth/callback`, where portal invitations land, and `/welcome`, where an invited candidate can choose a password (or skip it: "Email me a sign-in link" on `/login` always works).

**Configure** (values from Project Settings > API):

- `backend/.env`: `SUPABASE_URL=https://<project-ref>.supabase.co`. No secret key is needed.
- `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` (the same URL) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`). Never put a secret or service role key in a `NEXT_PUBLIC_` variable.
- In the dashboard, under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the Redirect URLs, so confirmation and reset links can return to `/auth/confirm` and invitations to `/auth/callback`. Keep **Confirm email** on (the default).

**Demo accounts.** The demo data has Alex Chen (recruiter) and Sophia Martinez (candidate) but no sign-ins. To give each one:

1. In the Supabase dashboard, open Authentication > Users > Add user > Create new user. Enter `alex.chen@encord.example` and a password of your choice, and tick **Auto Confirm User**. Do the same for `sophia.martinez@example.com`. Keep the passwords out of git.
2. Link each account to its person (from `backend/`):

   ```bash
   python -m app.db.accounts link alex.chen@encord.example      # Alex Chen, recruiter
   python -m app.db.accounts link sophia.martinez@example.com   # Sophia Martinez, candidate
   python -m app.db.accounts list                               # who can sign in
   ```

Linking never sets a role: Alex keeps the recruiter role his `users` row has, and Sophia gets a candidate `users` row tied to her existing candidate record. To add another recruiter or an admin, insert their `users` row (with `role`) in the database first, then create and link their account the same way. Resetting the demo data (`POST /api/v1/demo/reset`) keeps these links.

**Candidate sign-up.** A candidate can sign up at `/signup` with the email they applied with. After they click Supabase's confirmation email, the API links the account to their candidate record on their first request. That happens only if the email matches a candidate in the pipeline and no account is linked to them yet. Anyone else gets an account that can see nothing, and sign-up never creates a candidate or an application. Staff accounts are never linked automatically.

## Ashby (optional)

TalentBridge runs on its own (jobs, the careers site, applications, interviews and messages). The Ashby integration from before the refocus still works, but it isn't being developed in this phase. When connected, Ashby is the system of record; TalentBridge syncs what it needs and adds the candidate portal and communication on top. Code: `backend/app/integrations/ashby/`.

**1. API key** (Ashby Admin > Integrations > API keys). Give it `candidatesRead`, `jobsRead` and `interviewsRead` (read-only; TalentBridge never writes to Ashby). Put it in `backend/.env` as `ASHBY_API_KEY`. `GET /api/v1/integrations/ashby/status?check=true` (or Settings in the recruiter workspace) confirms it works; a missing permission is reported by name.

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

**Candidate portal invitations.** Applying through Ashby gives the candidate portal access at the email they applied with. If they already have a TalentBridge sign-in it's reused, never duplicated; otherwise Supabase emails them an invitation and they choose their own password (no password is ever generated, stored or sent). One person with several applications has one account. This needs, in `backend/.env`, `SUPABASE_SECRET_KEY` (Project Settings > API: the secret or service role key; server-side only, never in the frontend), and in Supabase, your frontend's `/**` in Authentication > URL Configuration > Redirect URLs (already there for sign-up).

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

Recruiters can post made-up demo jobs on a public careers page, and anyone can apply to them there. Each application then reaches TalentBridge through the simulator above, as a real Ashby application would. It writes to the database in `DATABASE_URL` and sends real Supabase invitations, so turn it on only with a development database.

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

**Several jobs.** One email is one candidate and one portal account, with one application per role. One invitation covers every role applied for while its link is valid (an hour, Supabase's default); after that, applying again sends a new one. If the email belongs to someone already in TalentBridge, the application joins their record without changing their name, phone or a résumé link the hiring team set, and for a role they're already in the pipeline for, the existing application stands.

**Supabase.** Keep **Confirm email** on. With it off, Supabase signs anyone straight in as whatever address they sign up with, so an invitation proves nothing. Its built-in email service also sends only a few emails an hour for the whole project; past that, applying says "Your application is saved" with **Try again**. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) raises the limit.

**Reset.** `python -m app.integrations.ashby.demo reset` also deletes the demo jobs with their postings, and every application made on the careers site, pending or submitted, with its résumé. Demo jobs that have applications from outside the simulator are kept, and so is anyone who was in TalentBridge before applying: only their careers applications go.

## Candidate communication

The core of TalentBridge (`backend/app/services/communication/`, migration `015`).

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

**Delivery.** Every recruiter message, from Today, the candidate page, the inbox or the assistant, goes the same way (`message_service.send_message`): to the candidate portal and the timeline (the audit entry) at once, with a delivery record; then by email when `RESEND_API_KEY` and `EMAIL_FROM` are set (a sender on a domain verified in Resend). Each message shows whether it was emailed, failed (with the reason) or reached the portal only; a failed email never unsends the portal message. Without Resend, everything still works and the workspace says that email isn't set up.

**Analytics.** `/recruiter/analytics` (`GET /communication/analytics?days=30`): candidates needing an update now, median time between updates (counting silences still going on), updates sent on time per rule, interview confirmation rate, unanswered messages, updates and emails sent, AI drafts generated, sent as written or edited, and discarded, and an estimate of recruiter time saved (5 minutes per AI draft sent; the assumption is shown).

## Careers site

`/careers` lists the open jobs made in TalentBridge (`/recruiter/jobs` → **Create job**). Applying takes a name, an email, an optional phone number and a résumé (PDF, DOC or DOCX, up to 5 MB): **no account and no password**. The application is created at once, at Applied with the source "Careers site", and the recruiter sees it with the résumé (`GET /resumes/{id}`, recruiters only). The applicant is emailed a secure link into their candidate portal: a Supabase invitation for a new account (`SUPABASE_SECRET_KEY` needed), or a sign-in link for an existing one. Applying again to the same job adds nothing and sends a fresh link; an email that can't be sent never undoes the application. API: `GET /careers/jobs`, `GET /careers/jobs/{id}`, `POST /careers/jobs/{id}/apply`, all public.

## Candidate portal and preparation

The portal home answers four questions from the portal's candidate-safe record: **Where am I** (the plain status), **What happens next**, **Do I need to do anything** (confirm an interview, read new messages, review an offer, or nothing) and **How should I prepare**, with the last update from the hiring team. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns internal notes, interviewer feedback, scores, rejection reasons or the hiring team's internal stage names.

Preparation (`/candidate/prep`) opens once the candidate is invited to interview and draws on the job posting, the company-approved profile (`services/company_profile.py`), the interview stage and the candidate's own résumé (its text is read from PDF and DOCX at upload): what to expect, role focus, topics, questions to ask, practice questions and **From your résumé**, the experiences worth having a story ready about. The **mock interview** asks one practice question at a time and gives a few coaching points on the typed answer; nothing is stored or shared, and it never scores. Ask AI answers from the same candidate-safe record and nothing else. How candidates use the portal isn't recorded.

## AI Assistant

`/recruiter/ai` is one assistant for typed and spoken requests about candidate communication, through one action engine (`POST /api/v1/assistant/requests`, `backend/app/services/assistant/`): "Who needs an update today?", "Which candidates have unanswered questions?", "Which interviews need confirmation?", "Who interviewed this week and hasn't had a follow-up?", "Draft Sarah an update" (written for the rule that needs attention, through the drafts ledger), "Send Sophia an interview invitation for next Tuesday", and questions about one candidate's application or next interview. Names are matched against the active pipeline and never guessed. Messages wait as editable proposals until the recruiter confirms, then go through the one send path, exactly once.

The AI never evaluates, scores, ranks or rejects candidates, lists strengths or concerns, or recommends a hiring decision; those requests are declined. **Voice** stays inside the assistant (the microphone beside Send): the recording is transcribed (Groq Whisper with `AI_PROVIDER=groq`, else the browser's own recognition) and never stored, and a spoken "send it" only shows the confirmation.

All `/assistant/*` routes check the recruiter role on the server; a candidate's token gets 403.

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase project URL and secret key (portal invitations and sign-in links), AI provider (`mock`, `gemini` or `groq`) and keys, `RESEND_API_KEY` and `EMAIL_FROM` (email delivery; optional), Ashby keys and options, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL, the Supabase URL and publishable key, and the mock-mode switch. Only public values belong here.

Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); section 24 describes the communication refocus.
