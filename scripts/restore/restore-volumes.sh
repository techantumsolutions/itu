#!/usr/bin/env bash
# Restore a Docker named volume from tar.gz[.enc].
# Usage:
#   CONFIRM=YES ./scripts/restore/restore-volumes.sh \
#     .backups/<stamp>/volumes/itu-prod_app_data.tar.gz.enc \
#     itu-prod_app_data
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")/../backup" && pwd)/_lib.sh"

[[ "${CONFIRM:-}" == "YES" ]] || die "Refusing to restore without CONFIRM=YES"
require_cmd docker

SRC="${1:-}"
VOL="${2:-}"
[[ -n "$SRC" && -f "$SRC" && -n "$VOL" ]] || die "Usage: CONFIRM=YES $0 <archive.tar.gz[.enc]> <volume_name>"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
ARCHIVE="$TMPDIR/volume.tar.gz"
decrypt_to_stdout "$SRC" >"$ARCHIVE"

log "Restoring volume $VOL from $SRC"
docker volume create "$VOL" >/dev/null
docker run --rm \
  -v "${VOL}:/volume" \
  -v "$TMPDIR:/backup:ro" \
  alpine:3.20 \
  sh -c "rm -rf /volume/* /volume/.[!.]* 2>/dev/null; tar -xzf /backup/volume.tar.gz -C /volume"

log "Volume restore complete: $VOL"
