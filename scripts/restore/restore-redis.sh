#!/usr/bin/env bash
# Restore Redis dump.rdb into the production redis container volume.
# Usage: CONFIRM=YES ./scripts/restore/restore-redis.sh .backups/<stamp>/redis.rdb[.enc]
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")/../backup" && pwd)/_lib.sh"

[[ "${CONFIRM:-}" == "YES" ]] || die "Refusing to restore without CONFIRM=YES"
require_cmd docker
SRC="${1:-}"
[[ -n "$SRC" && -f "$SRC" ]] || die "Usage: CONFIRM=YES $0 <redis.rdb[.enc]>"
CONTAINER="${REDIS_CONTAINER:-itu-prod-redis}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
decrypt_to_stdout "$SRC" >"$TMP"

log "Stopping Redis writes — stopping container $CONTAINER"
docker stop "$CONTAINER"

# Copy RDB into volume via helper container
VOL="${COMPOSE_PROJECT}_redis_data"
docker run --rm \
  -v "${VOL}:/data" \
  -v "$(dirname "$TMP"):/backup:ro" \
  alpine:3.20 \
  sh -c "cp /backup/$(basename "$TMP") /data/dump.rdb && chmod 644 /data/dump.rdb"

log "Starting Redis"
docker start "$CONTAINER"
sleep 2
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" "$CONTAINER" redis-cli ping | grep -q PONG \
  || die "Redis did not become healthy after restore"

log "Redis restore complete — BullMQ queues may need worker restart / cache rebuild"
compose restart worker cron 2>/dev/null || true
