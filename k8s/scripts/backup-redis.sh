#!/usr/bin/env bash
# Backup K8s itu-redis data to host tarball (no password printed).
set -euo pipefail
NS="${NS:-itu}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/itu/.deploy/redis-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/k8s-redis-$STAMP.tgz"

kubectl -n "$NS" exec itu-redis-0 -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli BGSAVE' >/dev/null
sleep 3
kubectl -n "$NS" exec itu-redis-0 -- sh -c 'cd /data && tar czf - .' >"$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
