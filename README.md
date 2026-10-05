# HireMesh

HireMesh is an AI-native recruiting platform: one system, two experiences. Recruiters work in the Recruiter Workspace, candidates follow their journey in the Candidate Portal, and every candidate interaction flows back to the recruiter as activity, engagement signals and suggested next actions, explained by an AI copilot that cites its sources.

**Status:** Recruiter Workspace and Candidate Portal running on the same FastAPI backend and Supabase database, behind Supabase Auth with role-based access, synced from Ashby by webhooks and a reconciliation sync. Ashby applicants are invited to the Candidate Portal automatically, and recruiters see how each candidate has engaged.

## Repository

- `frontend/` — Next.js app with the Recruiter Workspace (`/recruiter`) and the Candidate Portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: candidates, applications, jobs, interviews, activity, messages, AI and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`014`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).

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

`/` sends you to `/login`, then to your own workspace by role: recruiters and admins to the recruiter dashboard (`/recruiter/candidates`), candidates to the Candidate Portal (`/candidate`). Other recruiter routes: `/recruiter/jobs` (and `/jobs/[id]`), `/recruiter/interviews`, `/recruiter/messages`, `/recruiter/analytics`, `/recruiter/ai`, `/recruiter/settings` and `/recruiter/candidates/[id]`. Short aliases such as `/dashboard` and `/jobs` redirect there.

`/candidate` is the Candidate Portal for the signed-in candidate (Sophia Martinez in the demo). The dashboard keeps to what matters now: a greeting with where the current application stands, the application with its progress, the one next step (an interview to confirm or prepare for, a message to read, or what happens next), the latest update, and a small way into Ask AI. Everything else has its own page: `/candidate/applications` (Active, Completed / Inactive and Withdrawn, each opening `/candidate/application/[id]`), `/candidate/interviews` (with `/candidate/prep` for interview preparation), `/candidate/messages`, `/candidate/company`, `/candidate/ai` and `/candidate/profile`. The Company page shows the company-approved profile in `backend/app/services/company_profile.py` (sourced from encord.com; the hiring team owns it), and Ask AI answers company, culture, benefits and interview-process questions from that same profile and nothing else. It reads and writes the same records as the recruiter workspace through `/api/v1/candidate/*`, so an interview scheduled, confirmed or messaged about on one side shows on the other. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns interview feedback, internal notes, engagement or AI analysis; the candidate AI only ever sees that same candidate-safe record.

Every data call goes through `frontend/services/*` to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). For UI work without the backend, set `NEXT_PUBLIC_USE_MOCK_API=true` to use seeded in-browser data (recruiter workspace only, with no sign-in; the Candidate Portal always uses the API). Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Supabase**

1. Apply `supabase/migrations/001`–`014` in order (`supabase db push --db-url "$DATABASE_URL"`, the SQL editor, or `supabase db reset` locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development)). Never edit a migration that has been applied; add the next number instead.
2. Set `DATABASE_URL` in `backend/.env` to the project's connection string (direct or pooler), replacing `[YOUR-PASSWORD]` including the brackets.
3. Load the demo data: `python -m app.db.seed` (or `--reset` to replace existing data). The API also loads it into an empty database on startup while `SEED_DEMO_DATA=true`.

Row-level security is on with no policies: the browser only talks to the API, which connects as the database owner.

## Sign-in

Supabase Auth (email and password) proves who someone is; the API decides what they may do. The frontend sends the session's access token as `Authorization: Bearer` on every API call (`frontend/services/api.ts`), and the API verifies it against the project's public signing keys (signature, issuer, audience, expiry) before loading the `users` row it's linked to (`users.auth_user_id`). **The role on that row is the only source of access**: nothing the browser sends, and nothing in the token's metadata, can change it.

- **Recruiters and admins** use `/recruiter` and every staff endpoint. There is no public sign-up for them.
- **Candidates** use `/candidate` and `/api/v1/candidate/*` only, always scoped to their own record (`candidates.user_id`); the API never takes a candidate id from the browser.
- No token or an invalid one is `401`; a valid token without a linked account, or with the wrong role, is `403`. `users.disabled_at` revokes access immediately.

Pages: `/login`, `/signup` (candidates), `/forgot-password`, `/reset-password`, `/auth/confirm`, where Supabase's confirmation and reset emails land, `/auth/callback`, where portal invitations land, and `/welcome`, where an invited candidate chooses their password.

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

## Ashby

Ashby is the system of record; Talent Bridge syncs what it needs and adds the candidate portal, engagement and AI on top. Everything else works without Ashby connected. Code: `backend/app/integrations/ashby/`.

**1. API key** (Ashby Admin > Integrations > API keys). Give it `candidatesRead`, `jobsRead` and `interviewsRead` (read-only; Talent Bridge never writes to Ashby). Put it in `backend/.env` as `ASHBY_API_KEY`. `GET /api/v1/integrations/ashby/status?check=true` (or Settings in the recruiter workspace) confirms it works; a missing permission is reported by name.

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

**Candidate portal invitations.** Applying through Ashby gives the candidate portal access at the email they applied with. If they already have a Talent Bridge sign-in it's reused, never duplicated; otherwise Supabase emails them an invitation and they choose their own password (no password is ever generated, stored or sent). One person with several applications has one account. This needs, in `backend/.env`, `SUPABASE_SECRET_KEY` (Project Settings > API: the secret or service role key; server-side only, never in the frontend), and in Supabase, your frontend's `/**` in Authentication > URL Configuration > Redirect URLs (already there for sign-up).

Supabase's default **Invite user** email works as it is, so no custom SMTP or template is needed:

1. Its **Accept the invite** link opens Supabase's own `/auth/v1/verify`.
2. That checks the one-time token, then redirects to `<FRONTEND_URL>/auth/callback?next=/welcome` with the new session in the URL fragment (`#access_token=…&refresh_token=…&type=invite`).
3. `/auth/callback` takes the tokens out of the address bar, has Supabase check them, and opens `/welcome`.
4. On `/welcome` the candidate sees the address the account is for and chooses their password, then lands in `/candidate`.

An expired or already-used link shows "This link has expired or was already used" with sign-in and new-link options. Optionally, once custom SMTP lets you edit templates, you can point the invite link at `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite`. That works in any browser and keeps tokens out of the URL entirely, because `/auth/callback` hands it to the server route `/auth/confirm`.

A failed invitation never affects the import: the candidate shows "Invitation failed" to recruiters with a retry button, and the sync retries automatically. The reconciliation sync only invites people who applied in the last 14 days (`ASHBY_SYNC_INVITE_MAX_AGE_DAYS`), so a first sync never emails a backlog. Recruiters can also invite anyone from their engagement card. New applications also get an AI analysis in the background (`ASHBY_AUTO_ANALYZE=false` to turn it off); a failed analysis never fails the import.

**Trying it without an Ashby account (development only).** A simulator builds the webhooks Ashby would send from the test fixtures and runs them through the same webhook processor, importer, stage mapping, portal provisioning and AI analysis as real ones. It has no HTTP endpoint of its own (only the demo careers site below uses it from the API) and refuses to run when `ENVIRONMENT=production`. From `backend/`:

```bash
python -m app.integrations.ashby.demo apply --email testcandidate1@example.com --first-name Maya --last-name Patel --job "TEST - ML Engineer"
python -m app.integrations.ashby.demo stage --email testcandidate1@example.com --stage interview   # screening, offer, hired, rejected, withdrawn
python -m app.integrations.ashby.demo interview --email testcandidate1@example.com                 # --in-days N, at 16:00 UTC
python -m app.integrations.ashby.demo status
python -m app.integrations.ashby.demo reset                                                         # deletes only what the simulator and the demo careers site made
```

It writes to the database in `DATABASE_URL` and prints which one first. Its records carry `tb-demo-` Ashby ids, and `reset` deletes only those and the applications made on the demo careers site (Supabase Auth accounts are never touched). Rerunning `apply` counts as a redelivery, so nothing is created twice. It won't use an email that belongs to anyone outside the simulator. No invitation email is sent unless you add `--send-invite`, which only works for addresses that can receive mail. To open the candidate portal as the demo candidate, either use `--send-invite` with an address you own and accept the email, or add the user in Supabase (Authentication > Users > Add user, auto-confirmed) and run `python -m app.db.accounts link <email>`. Then sign in at `/login`.

### Demo careers site (development only)

Recruiters can post made-up demo jobs on a public careers page, and anyone can apply to them there. Each application then reaches Talent Bridge through the simulator above, as a real Ashby application would. It writes to the database in `DATABASE_URL` and sends real Supabase invitations, so turn it on only with a development database.

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

Either way, the `GET /me` that follows (from `/welcome`, the sign-in page or the portal) submits every application waiting for that email through the Ashby simulator. The same webhook processor and importer as a real Ashby application create the application, and the candidate if they're new, with the source "Ashby Simulator / Demo Careers", at Screening. The sign-in is linked to the candidate, recruiters see them with their phone, résumé and source, the candidate portal shows the application, and the AI analysis runs in the background (unless `ASHBY_AUTO_ANALYZE=false`). An application waits 24 hours: after that, signing in no longer submits it until they apply again.

**Several jobs.** One email is one candidate and one portal account, with one application per role. One invitation covers every role applied for while its link is valid (an hour, Supabase's default); after that, applying again sends a new one. If the email belongs to someone already in Talent Bridge, the application joins their record without changing their name, phone or a résumé link the hiring team set, and for a role they're already in the pipeline for, the existing application stands.

**Supabase.** Keep **Confirm email** on. With it off, Supabase signs anyone straight in as whatever address they sign up with, so an invitation proves nothing. Its built-in email service also sends only a few emails an hour for the whole project; past that, applying says "Your application is saved" with **Try again**. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) raises the limit.

**Reset.** `python -m app.integrations.ashby.demo reset` also deletes the demo jobs with their postings, and every application made on the careers site, pending or submitted, with its résumé. Demo jobs that have applications from outside the simulator are kept, and so is anyone who was in Talent Bridge before applying: only their careers applications go.

## Candidate engagement

Recruiters see, per application, a transparent 0-100 with its reasons (`GET /api/v1/candidates/{id}/engagement`, the **Candidate engagement** card):

| Part | Points | From |
|---|---|---|
| Portal activity | 30 | visits (visits within 30 minutes count once), active minutes, distinct views of the application, interviews, prep and messages |
| Responsiveness | 40 | share of requests answered (a recruiter message, an interview to confirm) and the median reply time; full speed points within a day |
| Proactive communication | 30 | messages the candidate started, interview confirmations, thank-you notes and follow-ups |

Every count has diminishing returns and a cap, so refreshing or sending ten messages can't inflate it. A part the candidate had no chance to earn (never had portal access, was never asked anything, had no interview to confirm) scores half, not zero; unanswered requests only count once 72 hours have passed. Fewer than three data points shows "Insufficient data" instead of a number. 70+ is High, 40+ Moderate. All numbers are in `backend/app/services/engagement/config.py`.

It is operational information, not candidate quality. It never ranks, advances or rejects anyone, isn't a sort order, and never reaches the AI (its context has no field for it). Candidates never see it.

What the portal reports, and only this (`frontend/lib/engagement.ts`): visits, a heartbeat every 30 seconds while the tab is visible and was used in the last two minutes (the server times the gaps, so background tabs and idle time add nothing), which portal pages and items were opened, and which Company page sections were read (on screen for a couple of seconds; only the section's name). The same report sent twice in a moment (a rerender, a double click) is sent once, and the server drops repeats within five minutes. A question to the candidate assistant is recorded as its topic only, never its words. No keystrokes, text, pointer positions, browser details or anything outside the portal.

## Candidate portal analytics

`/recruiter/analytics` shows recruiters how candidates use the Candidate Portal, in aggregate, so they can improve the experience. It measures the experience, not candidates: nothing on it is per candidate, and none of it feeds ranking, search order, AI evaluation or any decision. Every number is calculated on each request from the portal's own records (`portal_sessions` and `candidate_engagement_events`, never Ashby) in `backend/app/services/analytics/`:

- **Active Candidates**: candidates with a portal visit or event in the period. **Weekly Engaged**: candidates with meaningful activity (a page, section or feature view, a question, or a visit with at least a minute of active time) in the period's last seven days. **Average Engagement Time**: the mean active time per visit, as the server timed it. **Repeat Visit Rate**: the share of visiting candidates who came back. Each is compared with the period before it.
- **Portal Engagement**: visits and unique candidates by day, week, month or year. **What Candidates Are Looking For**: page and section views and the topics of assistant questions, in six categories (`services/analytics/topics.py`). **When Candidates Use the Portal**: visits by weekday and two-hour window, in the recruiter's local time, with the peak.
- **AI Insights**: at most four, written by the configured AI from the same aggregates. An answer with a number that isn't in them, or anything that reads as judging, ranking or hiring, is replaced by insights written by rules.
- The date filter (Today, Last 7/30/90 days, This year, Custom) applies to everything above. The API: `GET /api/v1/analytics/portal`, `/analytics/insights` and `/analytics/demographics`, recruiters only.

**Demo activity (development only).** For charts with something to show, generate months of made-up portal activity: candidates with applications to the open jobs, their visits, page and section views, question topics and voluntary demographic answers. It writes raw records only, through the same models and event recorder as the portal, so every percentage comes out of the normal calculations. It refuses `ENVIRONMENT=production` and names the database before writing:

```bash
python -m app.services.analytics.demo_activity generate   # from backend/; replaces what it generated before
python -m app.services.analytics.demo_activity reset      # the Ashby simulator's reset deletes it too
```

## Voluntary demographic information

The demo careers application form and the candidate portal profile ask four optional questions: region, race / ethnicity, disability status and sexual orientation, each with "Prefer not to say". They're kept apart from every candidate record (`candidate_demographics`, migration 014), and only the candidate can read or change their own (`GET`/`PUT /api/v1/candidate/demographics`). Recruiters see aggregates only, on the Analytics page and through the AI Assistant, from `services/demographics.py`:

- a question with fewer than 5 answers reports nothing; answers given by fewer than 5 people are combined into "Other / insufficient data", and if that group would itself be under 5, the next-smallest groups join it;
- shares are whole percentages and respondent counts are rounded down to a multiple of 5;
- never filtered by date, job or anything else, so no filter can isolate one person's answer.

No recruiter API returns an individual's answers, and no candidate list, search, detail, message, interview, AI context, ranking or analysis can see them. Answers given with a careers application are held separately until the application is submitted, then become the candidate's own.

## AI Assistant

`/recruiter/ai` is one assistant for typed and spoken requests. Both go through the same action engine (`POST /api/v1/assistant/requests`, `backend/app/services/assistant/`). The configured AI reads the words as one structured action (`assistant/rules.py` does when there's no model or it fails). Names are matched against the active pipeline and never guessed: two matches means a question back. Then the action runs through the existing services:

- **Messages**: "Send Sophia a personalized email asking her to schedule a 30-minute recruiter interview next Tuesday." The AI drafts it from the candidate's record. It waits as an editable proposal until the recruiter confirms, then `message_service.send_message` sends it, exactly once (a second confirmation is a 409). "Draft…" prepares it without the send step. Messages go to the candidate's portal messages: Talent Bridge has no outbound email provider.
- **Jobs**: "Create an entry-level Recruiting Engineer job in San Francisco…" drafts it with the AI job writer and saves it with the demo jobs service, as an ordinary job like one made on the Jobs page. "Make it hybrid", "salary 100 to 130K" and "add Python" change the same draft. "Publish the job" asks for confirmation, then publishes it to the Jobs page and `/demo/careers`. Needs `ENABLE_ASHBY_DEMO`.
- **Questions**: candidates by job and stage (in the pipeline's usual order), a candidate's application and next interview, open jobs, and Candidate Portal analytics from the analytics services. Demographics only ever come back as the Analytics page's aggregates. Asking about one person's, or to rank or filter people by anything, is refused.

**Voice.** The microphone (in the assistant's input, and in the top bar on every recruiter page) records in the browser, and `POST /api/v1/assistant/transcribe` turns the recording into words with Groq Whisper (`AI_PROVIDER=groq`; `GROQ_TRANSCRIPTION_MODEL`, default `whisper-large-v3-turbo`). The recording is never stored. Only the transcript is kept, with the structured action and its result, in the recruiter's Recent actions (`assistant_actions`). Without Groq, the browser's own speech recognition is used where there is one (Chrome, Edge). A name heard by sound ("Sofia") is matched to the pipeline's spelling and the reply says so. A spoken "send it" shows the confirmation; it never sends by itself.

All `/assistant/*` routes check the recruiter role on the server; a candidate's token gets 403.

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase project URL and secret key (portal invitations), AI provider (`mock`, `gemini` or `groq`) and keys, Ashby keys and options, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL, the Supabase URL and publishable key, and the mock-mode switch. Only public values belong here.

Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
