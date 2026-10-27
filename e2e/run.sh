#!/usr/bin/env bash
# The end-to-end run: a fresh database with every migration and the demo seed, a stand-in for Supabase Auth,
# the backend and a production build of the frontend, each on its own port, then the journeys in journeys.mjs
# in a headless browser. It stops what it started when it ends. See e2e/README.md.
#
#   E2E_ADMIN_URL=postgresql://postgres@127.0.0.1:5432/postgres bash e2e/run.sh [journey ...]
#
# Nothing here reads backend/.env or frontend/.env.local, sends a real email or uses ports 3000 and 8000.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
PYTHON="${E2E_PYTHON:-python}"
ADMIN_URL="${E2E_ADMIN_URL:-postgresql://postgres@127.0.0.1:5432/postgres}"
AUTH_PORT=8200 API_PORT=8300 WEB_PORT=3100

export E2E_ADMIN_URL="$ADMIN_URL" E2E_PYTHON="$PYTHON" E2E_DATABASE_URL="${ADMIN_URL%/*}/${E2E_DB_NAME:-tb_e2e}"
export E2E_AUTH_URL="http://localhost:$AUTH_PORT" E2E_WEB_URL="http://localhost:$WEB_PORT"
# The backend's settings all come from here: it runs from e2e/, where there's no .env to read.
export PYTHONPATH="$ROOT/backend" DATABASE_URL="$E2E_DATABASE_URL" SUPABASE_URL="$E2E_AUTH_URL" \
  SUPABASE_SECRET_KEY=e2e-secret FRONTEND_URL="$E2E_WEB_URL" CORS_ORIGINS="$E2E_WEB_URL" AI_PROVIDER=mock \
  ENVIRONMENT=development SEED_DEMO_DATA=false CONTACT_EMAIL=hello@kavuntra.example

pids=()
stop() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  # On Windows (Git Bash) a killed shell job can leave its program running: stop whatever holds the ports.
  if command -v taskkill > /dev/null; then
    for port in $AUTH_PORT $API_PORT $WEB_PORT; do
      for pid in $(netstat -ano | grep LISTENING | grep -E "[:.]$port +" | awk '{print $NF}' | sort -u); do
        taskkill //PID "$pid" //F > /dev/null 2>&1 || true
      done
    done
  fi
}
trap stop EXIT
ready() {
  for _ in $(seq 90); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
  echo "Nothing answered at $1" >&2
  return 1
}

cd "$HERE"
[ -d node_modules ] || npm install --no-audit --no-fund
"$PYTHON" make_db.py
"$PYTHON" -m app.db.seed > /dev/null

node fake-auth.mjs & pids+=($!)
ready "$E2E_AUTH_URL/auth/v1/health"
# The seeded people who sign in: Alex (full workspace), Sophia (candidate at several employers), Sam (Simple Hire).
for email in alex.chen@encord.example sophia.martinez@example.com sam@samscafe.example; do
  curl -sf -X POST "$E2E_AUTH_URL/__seed" -H "content-type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Demo-pass-2026\"}" > /dev/null
  "$PYTHON" -m app.db.accounts link "$email"
done

"$PYTHON" -m uvicorn app.main:app --port "$API_PORT" --log-level warning & pids+=($!)
ready "http://localhost:$API_PORT/health"

cd "$ROOT/frontend"
export NEXT_PUBLIC_SUPABASE_URL="$E2E_AUTH_URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-publishable-key \
  NEXT_PUBLIC_API_URL="http://localhost:$API_PORT/api/v1"
if [ -z "${E2E_SKIP_BUILD:-}" ]; then npx next build > "$HERE/next-build.log" 2>&1 || {
  tail -30 "$HERE/next-build.log"
  exit 1
}; fi
npx next start -p "$WEB_PORT" > /dev/null 2>&1 & pids+=($!)
ready "$E2E_WEB_URL"

cd "$HERE"
node journeys.mjs "$@"
