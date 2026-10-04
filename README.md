# HireMesh

HireMesh is an AI-native recruiting platform: one system, two experiences. Recruiters work in the Recruiter Workspace, candidates follow their journey in the Candidate Portal, and every candidate interaction flows back to the recruiter as activity, engagement signals and suggested next actions, explained by an AI copilot that cites its sources.

**Status:** Recruiter Workspace and Candidate Portal running on the same FastAPI backend and Supabase database, behind Supabase Auth with role-based access, synced from Ashby by webhooks and a reconciliation sync. Ashby applicants are invited to the Candidate Portal automatically, and recruiters see how each candidate has engaged.

## Repository

- `frontend/` — Next.js app with the Recruiter Workspace (`/recruiter`) and the Candidate Portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: candidates, applications, jobs, interviews, activity, messages, AI and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`012`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).

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

`/` sends you to `/login`, then to your own workspace by role: recruiters and admins to the recruiter dashboard (`/recruiter/candidates`), candidates to the Candidate Portal (`/candidate`). Other recruiter routes: `/recruiter/jobs` (and `/jobs/[id]`), `/recruiter/interviews`, `/recruiter/messages`, `/recruiter/ai`, `/recruiter/settings` and `/recruiter/candidates/[id]`. Short aliases such as `/dashboard` and `/jobs` redirect there.

`/candidate` is the Candidate Portal for the signed-in candidate (Sophia Martinez in the demo): their applications grouped as Active, No longer under consideration and Inactive, then `/candidate/application/[id]`, `/candidate/interviews`, `/candidate/messages`, `/candidate/prep` and `/candidate/profile` for the selected application (`/candidate/application` opens it). It reads and writes the same records as the recruiter workspace through `/api/v1/candidate/*`, so an interview scheduled, confirmed or messaged about on one side shows on the other. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns interview feedback, internal notes, engagement or AI analysis; the candidate AI only ever sees that same candidate-safe record.

Every data call goes through `frontend/services/*` to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). For UI work without the backend, set `NEXT_PUBLIC_USE_MOCK_API=true` to use seeded in-browser data (recruiter workspace only, with no sign-in; the Candidate Portal always uses the API). Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Supabase**

1. Apply `supabase/migrations/001`–`012` in order (`supabase db push --db-url "$DATABASE_URL"`, the SQL editor, or `supabase db reset` locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development)). Never edit a migration that has been applied; add the next number instead.
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

**Trying it without an Ashby account (development only).** A simulator builds the webhooks Ashby would send from the test fixtures and runs them through the same webhook processor, importer, stage mapping, portal provisioning and AI analysis as real ones. It has no HTTP endpoint and refuses to run when `ENVIRONMENT=production`. From `backend/`:

```bash
python -m app.integrations.ashby.demo apply --email testcandidate1@example.com --first-name Maya --last-name Patel --job "TEST - ML Engineer"
python -m app.integrations.ashby.demo stage --email testcandidate1@example.com --stage interview   # screening, offer, hired, rejected, withdrawn
python -m app.integrations.ashby.demo interview --email testcandidate1@example.com                 # --in-days N, at 16:00 UTC
python -m app.integrations.ashby.demo status
python -m app.integrations.ashby.demo reset                                                         # deletes only what the simulator made
```

It writes to the database in `DATABASE_URL` and prints which one first. Its records carry `tb-demo-` Ashby ids, and `reset` deletes only those (Supabase Auth accounts are never touched). Rerunning `apply` counts as a redelivery, so nothing is created twice. It won't use an email that belongs to anyone outside the simulator. No invitation email is sent unless you add `--send-invite`, which only works for addresses that can receive mail. To open the candidate portal as the demo candidate, either use `--send-invite` with an address you own and accept the email, or add the user in Supabase (Authentication > Users > Add user, auto-confirmed) and run `python -m app.db.accounts link <email>`. Then sign in at `/login`.

## Candidate engagement

Recruiters see, per application, a transparent 0-100 with its reasons (`GET /api/v1/candidates/{id}/engagement`, the **Candidate engagement** card):

| Part | Points | From |
|---|---|---|
| Portal activity | 30 | visits (visits within 30 minutes count once), active minutes, distinct views of the application, interviews, prep and messages |
| Responsiveness | 40 | share of requests answered (a recruiter message, an interview to confirm) and the median reply time; full speed points within a day |
| Proactive communication | 30 | messages the candidate started, interview confirmations, thank-you notes and follow-ups |

Every count has diminishing returns and a cap, so refreshing or sending ten messages can't inflate it. A part the candidate had no chance to earn (never had portal access, was never asked anything, had no interview to confirm) scores half, not zero; unanswered requests only count once 72 hours have passed. Fewer than three data points shows "Insufficient data" instead of a number. 70+ is High, 40+ Moderate. All numbers are in `backend/app/services/engagement/config.py`.

It is operational information, not candidate quality. It never ranks, advances or rejects anyone, isn't a sort order, and never reaches the AI (its context has no field for it). Candidates never see it.

What the portal reports, and only this (`frontend/lib/engagement.ts`): visits, a heartbeat every 30 seconds while the tab is visible and was used in the last two minutes (the server times the gaps, so background tabs and idle time add nothing), and which portal pages and items were opened. No keystrokes, text, pointer positions, browser details or anything outside the portal.

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase project URL and secret key (portal invitations), AI provider (`mock`, `gemini` or `groq`) and keys, Ashby keys and options, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL, the Supabase URL and publishable key, and the mock-mode switch. Only public values belong here.

Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
