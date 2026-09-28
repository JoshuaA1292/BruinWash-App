#!/usr/bin/env bash
# Resets the LOCAL Supabase database and loads demo data.
#
# Requires `npx supabase start` to be running. Only ever touches the local stack;
# there is no path in here that can reach a remote project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SEED="supabase/demo/seed_demo.sql"

echo "== resetting local database (re-applies every migration)"
npx --yes supabase@latest db reset --local

echo "== loading demo data"
# Prefer a local psql; fall back to the one inside the Postgres container so this
# works on a machine with no Postgres client installed.
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q -f "$SEED"
else
  CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
  if [ -z "$CONTAINER" ]; then
    echo "Could not find the supabase_db container. Is 'npx supabase start' running?" >&2
    exit 1
  fi
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$SEED"
fi

cat <<'TXT'

Demo accounts — password for all of them: demo1234

  demo.requester@ucla.edu    books laundry, tracks it, rates the washer
  demo.washer@ucla.edu       sees the job board, accepts, runs the pipeline
  demo.washer2@ucla.edu      second washer in the same building (accept race)
  demo.admin@ucla.edu        order dashboard

Promo code DEMO20 gives 20% off at checkout.
TXT
