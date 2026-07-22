# ITU K3s Migration — Backup & Rollback

## Backup plan

### Redis (required before cutover and nightly)

```bash
/var/www/itu/k8s/scripts/backup-redis.sh
# Artifacts: /var/www/itu/.deploy/redis-backups/k8s-redis-*.tgz
```

Also retain Compose volume snapshot from migrate:

```text
/var/www/itu/.deploy/redis-backups/compose-redis-*.tgz
```

### Kubernetes manifests

Git-tracked under `k8s/itu/`. Secrets are **not** in git — recreate with:

```bash
/var/www/itu/k8s/scripts/create-secrets.sh
```

### Application images

Pinned digests (immutable):

| Component | Digest |
|-----------|--------|
| web | `ghcr.io/techantumsolutions/itu/web@sha256:3b4252d7bc47e98650b7a0f113ba3cad9bdeff57706ef95797ac86683f77bcc6` |
| sidecar | `ghcr.io/techantumsolutions/itu/sidecar@sha256:5cd95837640f6472cc02bf6bc2b83cc328989eb7bee6dcfeb21b4a0cb036babc` |
| redis | `redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |

Import into K3s if node is rebuilt: `docker save … \| k3s ctr images import -`

---

## Rollback (restore Compose as edge)

Use when K3s cutover fails validation.

1. **Remove nginx edge override** (if applied):

```bash
rm -f /etc/nginx/conf.d/itu-k3s-edge.conf
nginx -t && systemctl reload nginx
```

2. **Stop K3s app consumers** (keep Redis PVC intact for forensics):

```bash
kubectl -n itu scale deploy --all --replicas=0
# optional: kubectl -n itu scale sts/itu-redis --replicas=0
```

3. **Start Compose application stack**:

```bash
cd /var/www/itu
docker compose -f docker-compose.prod.yml up -d
```

4. **Verify**:

```bash
curl -fsS http://127.0.0.1:4009/api/health/ready
curl -fsS http://127.0.0.1:3001/health
```

5. **Supabase** — never stopped; no rollback needed.

### Rollback Redis data to Compose (only if K8s corrupted queue)

```bash
# Stop compose redis + apps, restore tarball into itu-prod_redis_data, restart
# Prefer compose-redis-*.tgz taken before migration.
```

---

## Cutover approval gate

Do **not** `docker compose … stop` / remove itu-prod app services until:

- [ ] `validate.sh` all PASS
- [ ] ScaledObject Ready=True + HPA exists
- [ ] Queue scale-up / scale-down demonstrated
- [ ] Redis restart recovery OK
- [ ] Worker restart recovery OK
- [ ] Nginx edge serves `/api/health/ready`
- [ ] Rollback drill completed once (start Compose, hit health, re-cutover)
