#!/usr/bin/env bash
# Migrate Redis data from Docker Compose itu-prod-redis → K8s itu-redis PVC.
# Brief queue pause recommended. Does not print passwords.
set -euo pipefail

NS="${NS:-itu}"
COMPOSE_REDIS="${COMPOSE_REDIS:-itu-prod-redis}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/itu/.deploy/redis-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

echo "==> Preflight"
kubectl -n "$NS" get sts itu-redis >/dev/null
kubectl -n "$NS" rollout status sts/itu-redis --timeout=180s
docker inspect "$COMPOSE_REDIS" >/dev/null

echo "==> Backup Compose Redis (RDB via BGSAVE + docker cp)"
docker exec "$COMPOSE_REDIS" sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli BGSAVE' >/dev/null
# Wait for lastsave to advance
sleep 3
docker exec "$COMPOSE_REDIS" sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli LASTSAVE' >/dev/null
SRC_TAR="$BACKUP_DIR/compose-redis-$STAMP.tgz"
docker exec "$COMPOSE_REDIS" sh -c 'cd /data && tar czf - .' >"$SRC_TAR"
echo "Saved backup: $SRC_TAR ($(du -h "$SRC_TAR" | awk '{print $1}'))"

echo "==> Scale down ITU consumers that use Redis (avoid writes during restore)"
for d in itu-web itu-socket itu-worker itu-cron itu-system-plans-availability itu-system-plans-merge; do
  kubectl -n "$NS" scale deploy/"$d" --replicas=0 2>/dev/null || true
done
# Also pause Compose producers if running
docker stop itu-prod-cron itu-prod-worker itu-prod-system-plans-availability itu-prod-system-plans-merge 2>/dev/null || true

echo "==> Stop K8s Redis, restore into PVC via ephemeral helper"
kubectl -n "$NS" scale sts/itu-redis --replicas=0
kubectl -n "$NS" wait --for=delete pod/itu-redis-0 --timeout=120s 2>/dev/null || true

PVC="$(kubectl -n "$NS" get pvc -l app=itu-redis -o jsonpath='{.items[0].metadata.name}')"
echo "Using PVC: $PVC"

# Helper pod mounts the same PVC
kubectl -n "$NS" delete pod redis-restore --ignore-not-found >/dev/null 2>&1 || true
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: redis-restore
  namespace: $NS
spec:
  restartPolicy: Never
  containers:
    - name: restore
      image: redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99
      command: ["sleep", "3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: $PVC
EOF
kubectl -n "$NS" wait --for=condition=Ready pod/redis-restore --timeout=120s

echo "==> Clearing PVC and extracting backup"
kubectl -n "$NS" exec redis-restore -- sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null || true'
cat "$SRC_TAR" | kubectl -n "$NS" exec -i redis-restore -- tar xzf - -C /data
kubectl -n "$NS" exec redis-restore -- ls -la /data | head -20

kubectl -n "$NS" delete pod redis-restore --wait=true

echo "==> Start Redis + apps"
kubectl -n "$NS" scale sts/itu-redis --replicas=1
kubectl -n "$NS" rollout status sts/itu-redis --timeout=180s

for d in itu-web itu-socket itu-worker itu-cron itu-system-plans-availability itu-system-plans-merge; do
  kubectl -n "$NS" scale deploy/"$d" --replicas=1
done
kubectl -n "$NS" rollout status deploy/itu-web --timeout=300s
kubectl -n "$NS" rollout status deploy/itu-worker --timeout=180s

echo "==> Verify AUTH ping"
kubectl -n "$NS" exec itu-redis-0 -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
kubectl -n "$NS" exec itu-redis-0 -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli DBSIZE'

echo "OK: Redis migration complete. Backup kept at $SRC_TAR"
echo "NOTE: Compose app containers (except redis) may still be stopped — cutover next."
