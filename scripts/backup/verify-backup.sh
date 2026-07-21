#!/usr/bin/env bash
# Verify a backup run directory: manifest checksums + optional pg_restore --list.
# Usage: ./scripts/backup/verify-backup.sh [.backups/<stamp>|latest]
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

TARGET="${1:-$BACKUP_ROOT/latest}"
[[ -d "$TARGET" ]] || die "Backup directory not found: $TARGET"
MANIFEST="$TARGET/MANIFEST.tsv"
[[ -f "$MANIFEST" ]] || die "Missing MANIFEST.tsv in $TARGET"

log "Verifying backup at $TARGET"
ERRORS=0

while IFS=$'\t' read -r kind file expected size; do
  [[ -n "${file:-}" ]] || continue
  path="$TARGET/$file"
  # volumes live in subdirectory
  if [[ ! -f "$path" ]]; then
    path="$(find "$TARGET" -type f -name "$file" | head -1 || true)"
  fi
  if [[ -z "$path" || ! -f "$path" ]]; then
    log "MISSING $kind $file"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  actual="$(sha256_file "$path")"
  if [[ "$actual" != "$expected" ]]; then
    log "CHECKSUM MISMATCH $file expected=$expected actual=$actual"
    ERRORS=$((ERRORS + 1))
  else
    log "OK $kind $file ($size bytes)"
  fi
done <"$MANIFEST"

# Postgres structural verification
PG_DUMP="$(find "$TARGET" -maxdepth 1 \( -name 'postgres.dump' -o -name 'postgres.dump.enc' \) | head -1 || true)"
if [[ -n "$PG_DUMP" ]]; then
  require_cmd pg_restore
  TMP="$(mktemp)"
  if [[ "$PG_DUMP" == *.enc ]]; then
    decrypt_to_stdout "$PG_DUMP" >"$TMP"
  else
    cp "$PG_DUMP" "$TMP"
  fi
  if pg_restore --list "$TMP" >/dev/null; then
    log "OK pg_restore --list"
  else
    log "FAIL pg_restore --list"
    ERRORS=$((ERRORS + 1))
  fi
  rm -f "$TMP"
fi

if [[ "$ERRORS" -ne 0 ]]; then
  die "Verification failed with $ERRORS error(s)"
fi

log "Verification PASSED"
echo "ok"
