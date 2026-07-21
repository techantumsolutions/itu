#!/usr/bin/env bash
# Restore PostgreSQL from a pg_dump custom-format backup.
#
# DANGEROUS — overwrites target database objects.
# Usage:
#   CONFIRM=YES DATABASE_URL=... ./scripts/restore/restore-postgres.sh .backups/<stamp>/postgres.dump.enc
#
# Prefer restoring into a staging DB first, then cut over.
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")/../backup" && pwd)/_lib.sh"

[[ "${CONFIRM:-}" == "YES" ]] || die "Refusing to restore without CONFIRM=YES"
: "${DATABASE_URL:?DATABASE_URL is required (target)}"
require_cmd pg_restore

SRC="${1:-}"
[[ -n "$SRC" && -f "$SRC" ]] || die "Usage: CONFIRM=YES $0 <postgres.dump[.enc]>"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
decrypt_to_stdout "$SRC" >"$TMP"

TARGET_URL="${DIRECT_URL:-$DATABASE_URL}"
log "Restoring Postgres from $SRC → target DATABASE_URL (custom format)"

# Clean restore into existing DB (does not drop DB). Use --clean --if-exists.
pg_restore \
  --dbname="$TARGET_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --verbose \
  "$TMP" || {
    # pg_restore returns non-zero on some benign errors; surface and continue review.
    log "WARN: pg_restore exited non-zero — review output carefully"
  }

log "Running migrations to catch forward schema (safe expand)"
if [[ -x "$ROOT/scripts/db-migrate-production.sh" ]] || [[ -f "$ROOT/scripts/db-migrate-production.sh" ]]; then
  bash "$ROOT/scripts/db-migrate-production.sh" || log "WARN: post-restore migrate failed"
fi

log "Postgres restore finished — run application health checks"
