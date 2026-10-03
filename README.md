# HireMesh

HireMesh is an AI-native recruiting platform: one system, two experiences. Recruiters work in the Recruiter Workspace, candidates follow their journey in the Candidate Portal, and every candidate interaction flows back to the recruiter as activity, engagement signals and suggested next actions, explained by an AI copilot that cites its sources.

**Status:** Starter structure — feature logic pending approval.

## Repository

- `frontend/` — Next.js app with the Recruiter Workspace (`/recruiter`) and the Candidate Portal (`/candidate`).
- `backend/` — FastAPI service: API, orchestration, engagement engine and AI gateway.
- `supabase/` — Postgres migrations (`001`–`009`) and the demo seed for the Supabase project.

## Quickstart

**Frontend** (http://localhost:3000)

```bash
cd frontend && npm install && npm run dev
```

`/` opens the recruiter dashboard (`/recruiter/candidates`). Other recruiter routes: `/recruiter/jobs` (and `/jobs/[id]`), `/recruiter/interviews`, `/recruiter/messages`, `/recruiter/ai`, `/recruiter/settings` and `/recruiter/candidates/[id]`. Short aliases such as `/dashboard` and `/jobs` redirect there.

The frontend runs on seeded mock data by default, so no backend is needed. Every data call goes through `frontend/services/*`. Set `NEXT_PUBLIC_USE_MOCK_API=false` to send them to `NEXT_PUBLIC_API_URL` instead. Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Backend** (http://localhost:8000, health check at `/healthz`)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Or run it in Docker from the repository root: `docker compose up backend`.

**Supabase**

`supabase/migrations/` holds the schema and `supabase/seed.sql` the demo data. Apply them with the [Supabase CLI](https://supabase.com/docs/guides/local-development): `supabase start` runs the local stack (API http://localhost:54321, Postgres on port 54322) and `supabase db reset` reapplies the migrations and the seed.

## Environment

- `frontend/.env.local` — Supabase URL and publishable key, API URL, demo settings.
- `backend/.env` — database URL, Supabase keys, CORS, AI provider, demo and cron settings.

Both files contain placeholders only. Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
