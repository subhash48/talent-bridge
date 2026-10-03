# HireMesh

HireMesh is an AI-native recruiting platform: one system, two experiences. Recruiters work in the Recruiter Workspace, candidates follow their journey in the Candidate Portal, and every candidate interaction flows back to the recruiter as activity, engagement signals and suggested next actions, explained by an AI copilot that cites its sources.

**Status:** Recruiter Workspace and Candidate Portal running on the same FastAPI backend and Supabase database, behind Supabase Auth with role-based access. Ashby sync comes next.

## Repository

- `frontend/` — Next.js app with the Recruiter Workspace (`/recruiter`) and the Candidate Portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: candidates, applications, jobs, interviews, activity, messages, AI and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`010`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).

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

`/candidate` is the Candidate Portal for the signed-in candidate (Sophia Martinez in the demo): `/candidate/application`, `/candidate/interviews`, `/candidate/messages`, `/candidate/prep` and `/candidate/profile`. It reads and writes the same records as the recruiter workspace through `/api/v1/candidate/*`, so an interview scheduled, confirmed or messaged about on one side shows on the other. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns interview feedback, internal notes, engagement or AI analysis; the candidate AI only ever sees that same candidate-safe record.

Every data call goes through `frontend/services/*` to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). For UI work without the backend, set `NEXT_PUBLIC_USE_MOCK_API=true` to use seeded in-browser data (recruiter workspace only, with no sign-in; the Candidate Portal always uses the API). Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Supabase**

1. Apply `supabase/migrations/001`–`010` in order (`supabase db push --db-url "$DATABASE_URL"`, the SQL editor, or `supabase db reset` locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development)). Never edit a migration that has been applied; add the next number instead.
2. Set `DATABASE_URL` in `backend/.env` to the project's connection string (direct or pooler), replacing `[YOUR-PASSWORD]` including the brackets.
3. Load the demo data: `python -m app.db.seed` (or `--reset` to replace existing data). The API also loads it into an empty database on startup while `SEED_DEMO_DATA=true`.

Row-level security is on with no policies: the browser only talks to the API, which connects as the database owner.

## Sign-in

Supabase Auth (email and password) proves who someone is; the API decides what they may do. The frontend sends the session's access token as `Authorization: Bearer` on every API call (`frontend/services/api.ts`), and the API verifies it against the project's public signing keys (signature, issuer, audience, expiry) before loading the `users` row it's linked to (`users.auth_user_id`). **The role on that row is the only source of access**: nothing the browser sends, and nothing in the token's metadata, can change it.

- **Recruiters and admins** use `/recruiter` and every staff endpoint. There is no public sign-up for them.
- **Candidates** use `/candidate` and `/api/v1/candidate/*` only, always scoped to their own record (`candidates.user_id`); the API never takes a candidate id from the browser.
- No token or an invalid one is `401`; a valid token without a linked account, or with the wrong role, is `403`. `users.disabled_at` revokes access immediately.

Pages: `/login`, `/signup` (candidates), `/forgot-password`, `/reset-password`, and `/auth/confirm`, where Supabase's confirmation and reset emails land.

**Configure** (values from Project Settings > API):

- `backend/.env`: `SUPABASE_URL=https://<project-ref>.supabase.co`. No secret key is needed.
- `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` (the same URL) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`). Never put a secret or service role key in a `NEXT_PUBLIC_` variable.
- In the dashboard, under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the Redirect URLs, so confirmation and reset links can return to `/auth/confirm`. Keep **Confirm email** on (the default).

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

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase project URL, AI provider (`mock`, `gemini` or `groq`) and keys, Ashby keys, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL, the Supabase URL and publishable key, and the mock-mode switch. Only public values belong here.

Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
