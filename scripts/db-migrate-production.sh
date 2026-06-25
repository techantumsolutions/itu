#!/usr/bin/env bash
# Run Supabase migrations on a production host where Postgres runs in Docker
# and may not publish port 5432/54322 to the host.
#
#   npm run db:migrate:production
#   bash scripts/db-migrate-production.sh
#   bash scripts/db-migrate-production.sh --repair   # re-apply SQL even if version recorded (drift)

set -euo pipefail
cd "$(dirname "$0")/.."

REPAIR=0
if [ "${1:-}" = "--repair" ]; then
  REPAIR=1
fi

DB=$(docker ps --format '{{.Names}}' | grep -E 'supabase_db|supabase-db|supabase.*db' | head -1 || true)
if [ -z "$DB" ]; then
  DB=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)
fi
if [ -z "$DB" ]; then
  echo "ERROR: No Supabase/Postgres docker container found."
  docker ps --format 'table {{.Names}}\t{{.Ports}}'
  exit 1
fi

psql_exec() {
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

echo "Container: $DB"
echo "Mode: $([ "$REPAIR" -eq 1 ] && echo repair || echo pending-only)"

APPLIED=0
SKIPPED=0

for f in $(ls -1 supabase/migrations/*.sql 2>/dev/null | sort); do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#${version}_}

  exists=$(docker exec "$DB" psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

  if [ "$exists" = "1" ] && [ "$REPAIR" -eq 0 ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "Applying $(basename "$f") ..."
  psql_exec -f - < "$f"
  docker exec "$DB" psql -U postgres -d postgres -c \
    "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$name') ON CONFLICT (version) DO NOTHING;" >/dev/null
  APPLIED=$((APPLIED + 1))
done

psql_exec -c "NOTIFY pgrst, 'reload schema';" >/dev/null

echo "Done. Applied: $APPLIED  Skipped (already recorded): $SKIPPED"
echo "PostgREST schema cache reloaded."
