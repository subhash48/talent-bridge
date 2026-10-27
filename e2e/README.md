# End-to-end journeys

Kavuntra's three journeys, run in a real (headless) browser against the whole stack: a database built
from every migration, the demo seed, the backend and a production build of the frontend. Nothing is mocked
in Kavuntra itself. Only Supabase Auth is replaced: `fake-auth.mjs` is a small stand-in that signs real
tokens and puts every email in an outbox the journeys read, so no one's inbox is involved.

| Journey           | What it checks                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `website`         | Hero, navigation, every section, the contact form (stored), Privacy and Terms, sign in, phone width |
| `candidateSignup` | Test Candidate signs up, weak and mismatched passwords refused, verifies, signs in to the portal    |
| `applyFirst`      | Applies to Sam's Cafe without an account, gets the activation link, creates a password, sees it     |
| `sophiaElsewhere` | Sophia applies at another employer: no second account, both employers in her portal                 |
| `alex`            | Alex's full workspace: every section, Encord's pipeline only, never Sam's applicants                |
| `sam`             | Sam's Simple Hire: describes a cashier job and posts it, finds 3 applicants with reasons, sees their numbers, asks them to interview (nothing sent before Send), on a phone too |
| `employerSignup`  | A new small business signs up, chooses Simple Hire, lands in an empty workspace                     |

## Running them

You need Python with the backend's requirements, Node, Google Chrome and a PostgreSQL server you can create
a throwaway database on (the run drops and recreates `tb_e2e` there; nothing else is touched).

```bash
E2E_ADMIN_URL=postgresql://postgres@127.0.0.1:5432/postgres \
E2E_PYTHON=backend/.venv/bin/python \
bash e2e/run.sh            # every journey
bash e2e/run.sh sam alex   # only these
```

It prints `PASS` or `FAIL` for each check and exits non-zero if any failed. Screenshots go to `e2e/shots/`.

The stack uses ports 8200 (auth), 8300 (backend) and 3100 (frontend), so it runs beside a dev setup on 3000
and 8000. The backend runs from `e2e/` with every setting given by `run.sh`: `backend/.env` is never read,
so no real Supabase project, AI provider or email service is used.

| Setting          | Default                                          |                                               |
| ---------------- | ------------------------------------------------ | --------------------------------------------- |
| `E2E_ADMIN_URL`  | `postgresql://postgres@127.0.0.1:5432/postgres`  | a server to create the e2e database on        |
| `E2E_DB_NAME`    | `tb_e2e`                                         | the database dropped and recreated            |
| `E2E_PYTHON`     | `python`                                         | the Python with the backend's requirements    |
| `E2E_BROWSER`    | `chrome`                                         | or `msedge`                                   |
| `E2E_SKIP_BUILD` | unset                                            | set to reuse the last frontend build          |
| `E2E_SHOTS`      | `e2e/shots`                                      | where screenshots go                          |

`run.sh` builds the frontend in `frontend/.next`, pointed at the e2e stack: run `npm run build` again before
`npm start` against your own setup. On Windows, run it from Git Bash, from a folder OneDrive doesn't sync
(it can lock files in `.next` mid-build).

The seeded people sign in with the password `Demo-pass-2026`, which exists only in the stand-in auth
server. Voice input isn't covered (a headless browser has no microphone).
