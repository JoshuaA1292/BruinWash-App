#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres in Docker to prove the SQL
# is valid and the policies/functions compile. Usage: ./supabase/tests/run_migrations.sh
set -euo pipefail
CT=bruinwash-pgtest
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker rm -f "$CT" >/dev/null 2>&1 || true
docker run -d --name "$CT" -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17-alpine >/dev/null
printf 'waiting for postgres'
for _ in $(seq 1 60); do
  if docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1; then echo " ready"; break; fi
  printf '.'; sleep 1
done

run() {
  # pg_net ships with Supabase but not vanilla Postgres; the stub file supplies
  # net.http_post locally, so drop the CREATE EXTENSION line for the test only.
  sed 's/^create extension if not exists "pg_net";/-- pg_net stubbed locally/' "$1" \
    | docker exec -i "$CT" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres
}

echo "== stubs"
run "$ROOT/supabase/tests/00_supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== $(basename "$f")"
  run "$f"
done
if [ -f "$ROOT/supabase/tests/10_policy_tests.sql" ]; then
  echo "== policy + logic tests"
  run "$ROOT/supabase/tests/10_policy_tests.sql"
fi
echo
echo "ALL MIGRATIONS APPLIED CLEANLY"
docker rm -f "$CT" >/dev/null
