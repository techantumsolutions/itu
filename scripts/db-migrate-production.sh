#!/usr/bin/env bash
# Run Supabase migrations against the local Docker Postgres on a production host.
# Bypasses a broken DATABASE_URL in .env (e.g. postgresql://...@http://host:port/...).
#
#   npm run db:migrate:production
#   bash scripts/db-migrate-production.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB=$(docker ps --format '{{.Names}}' | grep -E 'supabase_db|supabase.*db' | head -1 || true)
if [ -z "$DB" ]; then
  DB=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
fi
if [ -z "$DB" ]; then
  echo "ERROR: No Supabase/Postgres docker container found."
  docker ps --format 'table {{.Names}}\t{{.Ports}}'
  exit 1
fi

PW=$(docker exec "$DB" printenv POSTGRES_PASSWORD 2>/dev/null || true)
PW=${PW:-postgres}
PORT=$(docker port "$DB" 5432/tcp 2>/dev/null | awk -F: '{print $NF}' | head -1 || true)
PORT=${PORT:-54322}

DB_URL="postgresql://postgres:${PW}@127.0.0.1:${PORT}/postgres"
echo "Container: $DB"
echo "Migrating via: postgresql://postgres:***@127.0.0.1:${PORT}/postgres"

npx supabase migration up --db-url "$DB_URL" --include-all

docker exec "$DB" psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';" >/dev/null
echo "Migrations complete. PostgREST schema cache reloaded."
