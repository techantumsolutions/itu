#!/usr/bin/env bash
# Backup named Docker volumes used by itu-prod (app uploads/recon/data).
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

require_cmd docker

VOLUMES=(
  "${COMPOSE_PROJECT}_app_public_uploads"
  "${COMPOSE_PROJECT}_app_storage_reconciliation"
  "${COMPOSE_PROJECT}_app_data"
  "${COMPOSE_PROJECT}_redis_data"
)

OUT_DIR="$RUN_DIR/volumes"
mkdir -p "$OUT_DIR"

for vol in "${VOLUMES[@]}"; do
  if ! docker volume inspect "$vol" >/dev/null 2>&1; then
    log "WARN: volume missing, skip: $vol"
    continue
  fi
  archive="$OUT_DIR/${vol}.tar.gz"
  log "Archiving volume $vol → $archive"
  docker run --rm \
    -v "${vol}:/volume:ro" \
    -v "$OUT_DIR:/backup" \
    alpine:3.20 \
    tar -czf "/backup/$(basename "$archive")" -C /volume .
  write_manifest_line "volume" "$archive"
  encrypt_file "$archive"
  [[ -f "${archive}.enc" ]] && write_manifest_line "volume" "${archive}.enc"
done

log "Docker volume backup complete"
