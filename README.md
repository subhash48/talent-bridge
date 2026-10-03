# HireMesh

HireMesh is an AI-native recruiting platform: one system, two experiences. Recruiters work in the Recruiter Workspace, candidates follow their journey in the Candidate Portal, and every candidate interaction flows back to the recruiter as activity, engagement signals and suggested next actions, explained by an AI copilot that cites its sources.

**Status:** Recruiter Workspace and Candidate Portal running on the same FastAPI backend and database. Authentication, Supabase and Ashby sync come next.

## Repository

- `frontend/` — Next.js app with the Recruiter Workspace (`/recruiter`) and the Candidate Portal (`/candidate`).
- `backend/` — FastAPI service under `/api/v1`: candidates, applications, jobs, interviews, activity, messages, AI and an optional Ashby integration.
- `supabase/` — Postgres migrations (`001`–`009`) and the demo seed (`seed.sql`, generated from `backend/app/db/seed_data.py`).

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

`/` opens the recruiter dashboard (`/recruiter/candidates`). Other recruiter routes: `/recruiter/jobs` (and `/jobs/[id]`), `/recruiter/interviews`, `/recruiter/messages`, `/recruiter/ai`, `/recruiter/settings` and `/recruiter/candidates/[id]`. Short aliases such as `/dashboard` and `/jobs` redirect there.

`/candidate` opens the Candidate Portal as the demo candidate, Sophia Martinez: `/candidate/application`, `/candidate/interviews`, `/candidate/messages`, `/candidate/prep` and `/candidate/profile`. It reads and writes the same records as the recruiter workspace through `/api/v1/candidate/*`, so an interview scheduled, confirmed or messaged about on one side shows on the other. Candidate responses are built in `backend/app/services/candidate_visibility.py`, which never returns interview feedback, internal notes, engagement or AI analysis; the candidate AI only ever sees that same candidate-safe record.

Every data call goes through `frontend/services/*` to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). For UI work without the backend, set `NEXT_PUBLIC_USE_MOCK_API=true` to use seeded in-browser data (recruiter workspace only; the Candidate Portal always uses the API). Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

**Supabase**

1. Apply `supabase/migrations/001`–`009` in order (SQL editor, or `supabase db reset` with the [Supabase CLI](https://supabase.com/docs/guides/local-development)).
2. Set `DATABASE_URL` in `backend/.env` to the project's connection string (direct or pooler).
3. Load the demo data: `python -m app.db.seed` (or `--reset` to replace existing data). The API also loads it into an empty database on startup while `SEED_DEMO_DATA=true`.

Row-level security is on with no policies: the browser only talks to the API, which connects as the database owner.

## Environment

- `backend/.env` (see `backend/.env.example`) — database URL, Supabase keys, AI provider (`mock`, `gemini` or `groq`) and keys, Ashby keys, CORS. Server-side only.
- `frontend/.env.local` (see `frontend/.env.example`) — the API URL and mock-mode switch. Never put secrets here.

Never commit real secrets.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
