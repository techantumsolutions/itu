# ITU → K3s runbook (namespace: itu)

## Images (immutable digests)

- web: `ghcr.io/techantumsolutions/itu/web@sha256:3b4252d7bc47e98650b7a0f113ba3cad9bdeff57706ef95797ac86683f77bcc6`
- sidecar: `ghcr.io/techantumsolutions/itu/sidecar@sha256:5cd95837640f6472cc02bf6bc2b83cc328989eb7bee6dcfeb21b4a0cb036babc`
- redis: `redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99`

## Apply order

```bash
chmod +x /var/www/itu/k8s/scripts/*.sh

# 1) PriorityClasses + namespace + config + supabase bridge + redis + apps (no secret yet will fail)
kubectl apply -f /var/www/itu/k8s/itu/00-namespace.yaml
kubectl apply -f /var/www/itu/k8s/itu/05-priorityclasses.yaml
/var/www/itu/k8s/scripts/create-secrets.sh
kubectl apply -f /var/www/itu/k8s/itu/10-configmap.yaml
kubectl apply -f /var/www/itu/k8s/itu/90-supabase-external.yaml
kubectl apply -f /var/www/itu/k8s/itu/20-redis.yaml
kubectl -n itu rollout status sts/itu-redis --timeout=180s

# 2) Application Deployments
kubectl apply -f /var/www/itu/k8s/itu/30-web.yaml
kubectl apply -f /var/www/itu/k8s/itu/40-socket.yaml
kubectl apply -f /var/www/itu/k8s/itu/50-worker.yaml
kubectl apply -f /var/www/itu/k8s/itu/60-cron.yaml
kubectl apply -f /var/www/itu/k8s/itu/70-system-plans.yaml

# 3) KEDA
kubectl apply -f /var/www/itu/k8s/itu/80-keda.yaml

# 4) Migrate Redis from Compose (pauses consumers)
/var/www/itu/k8s/scripts/migrate-redis.sh

# 5) Validate
/var/www/itu/k8s/scripts/validate.sh

# 6) Scale down legacy default-ns duplicates (wrong Redis / broken KEDA)
kubectl -n default scale deploy --all --replicas=0

# 7) Cutover edge (stop Compose web/socket first to free ports)
docker stop itu-prod-web itu-prod-socket itu-prod-cron itu-prod-worker \
  itu-prod-system-plans-availability itu-prod-system-plans-merge
/var/www/itu/k8s/scripts/cutover-nginx.sh

# 8) Rollback drill, then load/KEDA tests — see K8S-BACKUP-ROLLBACK.md
```

## Single Redis

All clients use Service `itu-redis.itu.svc.cluster.local:6379` with `REDIS_PASSWORD` from `itu-app-secrets`.

## KEDA

- `address: itu-redis:6379` (host:port)
- `TriggerAuthentication` → `REDIS_PASSWORD`
- `minReplicaCount: 1` until production soak allows 0
