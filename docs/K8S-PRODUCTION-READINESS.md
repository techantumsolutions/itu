# ITU K3s Production Readiness Report

**Date:** 2026-07-22  
**Cluster:** K3s `v1.36.2+k3s1` single-node `srv1181239`  
**Namespace:** `itu`

---

## 1. Root cause (pre-migration)

Hybrid Compose + K3s caused:

- KEDA `addressFromEnv: REDIS_URL` with `redis://…` → dial error (`too many colons`)
- K8s `redis-external` → host `:6379` → legacy `itu-redis` (no AUTH), not `itu-prod-redis`
- Duplicate workers/cron/socket in Compose and `default` ns
- Incomplete K8s secrets (2 keys vs full `.env`)

---

## 2. Architecture (current)

```text
Internet → host nginx (:4009, :3001)
              ↓ ClusterIP
         ns/itu: itu-web, itu-socket, itu-worker(+KEDA),
                 itu-cron, system-plans-*, itu-redis (STS+PVC+AUTH)
              ↓
         supabase-external → Docker Compose Kong :8000
```

**One Redis:** `itu-redis.itu.svc.cluster.local:6379` (AUTH via Secret).

**Intentionally outside K8s:** Supabase Compose stack; unrelated host apps (dograh, other PM2).

---

## 3. Kubernetes resource inventory (`itu`)

| Resource | Name |
|----------|------|
| PriorityClass | `itu-critical`, `itu-platform`, `itu-workers` |
| ConfigMap | `itu-config` |
| Secret | `itu-app-secrets` (51 keys from `.env`) |
| StatefulSet + PVC | `itu-redis` / `data-itu-redis-0` (5Gi) |
| Deployments | web, socket, worker, cron, system-plans-availability, system-plans-merge |
| Services (ClusterIP) | itu-web, itu-socket, itu-redis, itu-redis-headless, supabase-external |
| PDBs | web, socket, worker |
| TriggerAuthentication | `itu-redis-auth` |
| ScaledObject | `itu-worker-scaler` (Ready=True, min=1, max=10) |
| HPA | `keda-hpa-itu-worker-scaler` |

### Image digests (immutable)

| Image | Digest |
|-------|--------|
| web | `ghcr.io/techantumsolutions/itu/web@sha256:3b4252d7bc47e98650b7a0f113ba3cad9bdeff57706ef95797ac86683f77bcc6` |
| sidecar | `ghcr.io/techantumsolutions/itu/sidecar@sha256:5cd95837640f6472cc02bf6bc2b83cc328989eb7bee6dcfeb21b4a0cb036babc` |
| redis | `redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |

---

## 4. Files added / changed

```text
k8s/itu/00-namespace.yaml
k8s/itu/05-priorityclasses.yaml
k8s/itu/10-configmap.yaml
k8s/itu/20-redis.yaml
k8s/itu/30-web.yaml
k8s/itu/40-socket.yaml
k8s/itu/50-worker.yaml
k8s/itu/60-cron.yaml
k8s/itu/70-system-plans.yaml
k8s/itu/80-keda.yaml
k8s/itu/90-supabase-external.yaml
k8s/scripts/create-secrets.sh
k8s/scripts/migrate-redis.sh
k8s/scripts/backup-redis.sh
k8s/scripts/cutover-nginx.sh
k8s/scripts/validate.sh
k8s/scripts/loadtest-queue.sh
docs/K8S-MIGRATION-RUNBOOK.md
docs/K8S-BACKUP-ROLLBACK.md
docs/K8S-PRODUCTION-READINESS.md (this file)
/www/server/panel/vhost/nginx/itu-k3s-edge.conf (host edge)
```

---

## 5. Fixes applied

| Issue | Fix |
|-------|-----|
| Malformed KEDA address | `address: itu-redis.itu.svc.cluster.local:6379` |
| Missing Redis auth for KEDA | TriggerAuthentication → `REDIS_PASSWORD` |
| Split-brain Redis | Single in-cluster StatefulSet + data migrate from Compose |
| Missing web in K8s | Deployment + Service + probes |
| Incomplete secrets | `itu-app-secrets` from full `.env` |
| `:latest` drift | Digest-pinned images |
| Host edge | baota nginx → ClusterIP `:4009`/`:3001` |

---

## 6. Validation evidence

| Check | Result |
|-------|--------|
| Pods Ready | All 7/7 Running |
| `/api/health/ready` via :4009 | ok (redis+database up) |
| Socket `/health` via :3001 | ok |
| Redis AUTH ping | PONG |
| ScaledObject Ready | **True** |
| HPA created | `keda-hpa-itu-worker-scaler` targets `0/5` |

---

## 7. Autoscaling evidence

| Phase | Evidence |
|-------|----------|
| Scale-up | `LLEN=25` on test list → replicas **1 → 4** in ~20s (metric 25, desired 4) |
| Scale-down | List deleted → replicas **5 → 1** after HPA window (~310s) |
| Production list restored | `bull:provider-sync:wait` |

---

## 8. Recovery evidence

| Scenario | Result |
|----------|--------|
| Redis pod delete | STS recreated, PONG, web ready immediately |
| Worker pod delete | New pod Ready |
| KEDA operator restart | ScaledObject Ready=True, HPA intact |
| Rollback drill | Compose web restored on :4009; re-cutover to K3s succeeded |
| Compose app removal | App containers removed; volumes retained under `.deploy/redis-backups` + Docker volumes |

**Not run on this pass (single-node / maintenance):** full 100/500/1000 real BullMQ job soak, node reboot. Recommended in next maintenance window.

**Exactly-once:** BullMQ is at-least-once; idempotent handlers + unique jobIds remain required.

---

## 9. Production readiness score

| Area | Score |
|------|-------|
| Orchestration unity | 9/10 |
| Redis integrity | 9/10 |
| Autoscaling | 8/10 (minReplicas=1; scale-to-0 deferred) |
| Secrets | 8/10 (Secret exists; consider SealedSecrets/SOPS later) |
| Networking | 8/10 (ClusterIP + host nginx; ClusterIP must be refreshed in nginx if Service recreated) |
| HA | 5/10 (single node) |
| **Overall** | **8/10** |

---

## 10. Remaining risks

1. **Single-node K3s** — node restart = full downtime.
2. **Nginx hard-codes ClusterIP** — re-run `cutover-nginx.sh` if `itu-web`/`itu-socket` Services are recreated.
3. **`SHOW_DEV_OTP=true`** still in ConfigMap — disable for public production.
4. **default ns** legacy Deployments scaled to 0 — delete when confident.
5. **Compose Redis volume** stopped but retained — do not `docker volume rm` until backup retention policy met.
6. **Scale-to-0** not enabled yet (by design).

---

## 11. Rollback plan

See `docs/K8S-BACKUP-ROLLBACK.md`.

Quick path:

```bash
rm -f /www/server/panel/vhost/nginx/itu-k3s-edge.conf
/www/server/nginx/sbin/nginx -s reload
kubectl -n itu scale deploy --all --replicas=0
cd /var/www/itu && docker compose -f docker-compose.prod.yml up -d
```

Backups: `/var/www/itu/.deploy/redis-backups/`

---

## 12. Final approval checklist

- [x] Supabase remains on Compose
- [x] App stack in `itu` namespace
- [x] Redis StatefulSet + PVC + AUTH
- [x] ClusterIP + host nginx edge
- [x] Digest-pinned images
- [x] minReplicaCount=1
- [x] Requests/limits, probes, PriorityClasses, PDBs
- [x] Backup scripts + rollback drill
- [x] HPA + KEDA Ready=True + scale test
- [x] Compose app stack removed after cutover + rollback verify
- [ ] Optional: delete `default` ns ITU Deployments
- [ ] Optional: node restart drill in maintenance window
- [ ] Optional: minReplicaCount → 0 after soak
- [ ] Optional: `SHOW_DEV_OTP=false`
