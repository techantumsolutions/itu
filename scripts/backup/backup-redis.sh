#!/usr/bin/env bash
# Redis RDB snapshot copy from the production redis volume / container.
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

require_cmd docker
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"

OUT="$RUN_DIR/redis.rdb"
CONTAINER="${REDIS_CONTAINER:-itu-prod-redis}"

log "Triggering Redis BGSAVE in $CONTAINER"
if ! docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" "$CONTAINER" redis-cli BGSAVE >/dev/null; then
  die "BGSAVE failed — is redis running? ($CONTAINER)"
fi

# Wait for background save to finish.
for _ in $(seq 1 60); do
  status="$(docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" "$CONTAINER" redis-cli LASTSAVE)"
  sleep 1
  status2="$(docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" "$CONTAINER" redis-cli LASTSAVE)"
  # Also check info persistence
  if docker exec -e REDISCLI_AUTH="$REDIS_PASSWORD" "$CONTAINER" redis-cli INFO persistence \
    | grep -q 'rdb_bgsave_in_progress:0'; then
    break
  fi
  [[ "$status" != "$status2" ]] && break
done

docker cp "$CONTAINER:/data/dump.rdb" "$OUT" 2>/dev/null \
  || docker exec "$CONTAINER" cat /data/dump.rdb >"$OUT"

[[ -s "$OUT" ]] || die "Redis dump empty or missing"

# Best-effort AOF copy (may be large).
if docker exec "$CONTAINER" test -f /data/appendonly.aof 2>/dev/null; then
  docker cp "$CONTAINER:/data/appendonly.aof" "$RUN_DIR/redis-appendonly.aof" || true
  if [[ -f "$RUN_DIR/redis-appendonly.aof" ]]; then
    write_manifest_line "redis-aof" "$RUN_DIR/redis-appendonly.aof"
    encrypt_file "$RUN_DIR/redis-appendonly.aof"
    [[ -f "$RUN_DIR/redis-appendonly.aof.enc" ]] && write_manifest_line "redis-aof" "$RUN_DIR/redis-appendonly.aof.enc"
  fi
fi

write_manifest_line "redis" "$OUT"
encrypt_file "$OUT"
[[ -f "${OUT}.enc" ]] && write_manifest_line "redis" "${OUT}.enc"

log "Redis backup complete"
