#!/usr/bin/env bash
# Full scheduled backup orchestrator.
# Usage:
#   BACKUP_ENCRYPTION_KEY=... DATABASE_URL=... ./scripts/backup/backup-all.sh
# Optional skips: SKIP_POSTGRES=1 SKIP_REDIS=1 SKIP_VOLUMES=1 SKIP_STORAGE=1 SKIP_ENV=1
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/_lib.sh
source "$DIR/_lib.sh"

log "=== ITU backup start stamp=$STAMP dir=$RUN_DIR ==="
echo "stamp=$STAMP" >"$RUN_DIR/BACKUP_INFO.txt"
echo "host=$(hostname 2>/dev/null || echo unknown)" >>"$RUN_DIR/BACKUP_INFO.txt"
echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$RUN_DIR/BACKUP_INFO.txt"

FAILED=0
run_step() {
  local name="$1" script="$2"
  log "--- $name ---"
  if bash "$script"; then
    log "OK $name"
  else
    log "FAIL $name"
    FAILED=1
  fi
}

[[ "${SKIP_POSTGRES:-0}" == "1" ]] || run_step postgres "$DIR/backup-postgres.sh"
[[ "${SKIP_REDIS:-0}" == "1" ]] || run_step redis "$DIR/backup-redis.sh"
[[ "${SKIP_VOLUMES:-0}" == "1" ]] || run_step volumes "$DIR/backup-volumes.sh"
[[ "${SKIP_STORAGE:-0}" == "1" ]] || run_step storage "$DIR/backup-storage.sh"
[[ "${SKIP_ENV:-0}" == "1" ]] || run_step env "$DIR/backup-env.sh"

echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$RUN_DIR/BACKUP_INFO.txt"
echo "status=$([[ $FAILED -eq 0 ]] && echo ok || echo partial_failure)" >>"$RUN_DIR/BACKUP_INFO.txt"

# Copy latest pointer
ln -sfn "$RUN_DIR" "$BACKUP_ROOT/latest" 2>/dev/null || {
  rm -rf "$BACKUP_ROOT/latest"
  cp -a "$RUN_DIR" "$BACKUP_ROOT/latest"
}

prune_old_backups "$BACKUP_RETENTION_DAYS"

if [[ "$FAILED" -ne 0 ]]; then
  die "Backup finished with failures — inspect $RUN_DIR"
fi

log "=== ITU backup OK → $RUN_DIR ==="
echo "$RUN_DIR"
