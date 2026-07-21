#!/usr/bin/env bash
# Logical PostgreSQL backup (pg_dump custom format) + optional encryption.
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

require_cmd pg_dump
: "${DATABASE_URL:?DATABASE_URL is required}"

OUT="$RUN_DIR/postgres.dump"
log "Backing up Postgres → $OUT"

# Prefer DIRECT_URL (session mode) when present for dumps.
DUMP_URL="${DIRECT_URL:-$DATABASE_URL}"

pg_dump "$DUMP_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file="$OUT"

write_manifest_line "postgres" "$OUT"
encrypt_file "$OUT"
[[ -f "${OUT}.enc" ]] && write_manifest_line "postgres" "${OUT}.enc"

# Capture restore metadata (non-secret).
{
  echo "stamp=$STAMP"
  echo "format=custom"
  echo "dumped_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tool=pg_dump"
  if command -v psql >/dev/null 2>&1; then
    psql "$DUMP_URL" -Atc "SELECT version();" 2>/dev/null | head -1 || true
  fi
} >"$RUN_DIR/postgres.meta.txt"

log "Postgres backup complete"
