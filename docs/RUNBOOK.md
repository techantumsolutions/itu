# Operations Runbook

Day-2 operational procedures for ITU production. For DR specifics see [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md).

## Quick reference

| Situation | Action |
|-----------|--------|
| Deploy new SHA | `npm run deploy:prod` (CI/CD) |
| Bad deploy | `npm run deploy:rollback` |
| Health check | `npm run deploy:healthcheck` |
| Daily backup | `npm run backup:all` |
| Verify backup | `npm run backup:verify` |
| DB migrate only | `npm run db:migrate:production` |

## 1. Backup runbook

**When:** Daily 02:15 UTC (cron) or before risky migrations.

```bash
# /etc/itu/backup.env must include BACKUP_ENCRYPTION_KEY, DATABASE_URL, REDIS_PASSWORD, …
set -a; source /etc/itu/backup.env; set +a
cd /opt/itu
./scripts/backup/backup-all.sh
./scripts/backup/verify-backup.sh
# Optional offsite:
# rclone copy .backups/latest remote:itu-backups/$(date -u +%Y%m%d)
```

**Success:** script prints `ITU backup OK` and verify prints `Verification PASSED`.  
**Failure:** inspect `.backups/<stamp>/`, fix credentials/disk, re-run; page on-call if two consecutive failures.

## 2. Restore runbook (staging drill)

**When:** Weekly.

1. Provision staging DB URL.
2. `CONFIRM=YES DATABASE_URL=… ./scripts/restore/restore-postgres.sh .backups/latest/postgres.dump.enc`
3. Point staging app at staging DB; run health checks.
4. Log duration in incident/DR evidence channel.

## 3. Production data restore runbook

**When:** Confirmed data loss; IC approved.

1. Announce maintenance; stop `web`/`worker`/`cron` if needed.
2. Verify backup: `./scripts/backup/verify-backup.sh .backups/<stamp>`
3. Restore Postgres with `CONFIRM=YES`.
4. Restore Storage / volumes if required.
5. Redis: restore or rebuild.
6. Start stack; `deploy:healthcheck`.
7. Smoke: admin login, wallet balance, catalog.
8. Announce recovery; write postmortem.

## 4. Deploy / rollback runbook

**Deploy:** CI builds SHA → `deploy.yml` SSH → `scripts/deploy-prod.sh` (migrate → pull images → health → auto-rollback on fail).

**Manual rollback:**

```bash
export DEPLOY_SHA=<previous>
export IMAGE_WEB=ghcr.io/techantumsolutions/itu/web:$DEPLOY_SHA
export IMAGE_SIDECAR=ghcr.io/techantumsolutions/itu/sidecar:$DEPLOY_SHA
npm run deploy:rollback
```

## 5. Redis persistence & recovery

Production Redis (`docker-compose.prod.yml`) runs with:

- `appendonly yes` / `appendfsync everysec`
- RDB snapshots (`save` thresholds)
- Volume `redis_data`

**Recovery:**

- Restart container → AOF/RDB replay automatic.
- Corrupt data → `restore-redis.sh` or empty volume + cache rebuild (`docs/RESTORE.md`).

## 6. Supabase / Postgres ops

- App uses **service_role** only (`lib/db/supabase-rest.ts`).
- Financial grants locked down: migration `20260721120000_…` + [ADR 005](./adr/005-financial-least-privilege-rls.md).
- After restore, re-run `supabase/scripts/verify_financial_least_privilege.sql` if grants may have been reverted from an old dump.

## 7. Secrets rotation (high level)

1. Generate new secret; store in vault.
2. Update host `.env` (and backup.env if needed).
3. Rolling restart affected services.
4. Invalidate old credentials at provider (Razorpay, etc.).
5. Take a fresh encrypted backup after rotation.

## 8. Monitoring & alerting (minimum)

| Signal | Alert if |
|--------|----------|
| Backup cron | Missing success in 26h |
| `verify-backup` | Non-zero exit |
| `/api/health/ready` | Failing 5m |
| Disk on `BACKUP_ROOT` | &lt; 20% free |
| Postgres | Connection errors in app logs/Sentry |

Wire alerts to your pager (Uptime Kuma, Prometheus, cloudwatch, etc.).

## 9. Capacity notes

- Postgres dump size grows with `transactions` / catalog; size `BACKUP_ROOT` for ≥ 40 daily copies.
- Redis volume small vs DB; AOF can grow — `redis-cli BGREWRITEAOF` during low traffic if needed.
- Offsite bandwidth: first full copy largest; dailies incremental via sync tools.

## 10. Contacts

Fill in for your org:

| Function | Contact |
|----------|---------|
| On-call SRE | |
| DB owner | |
| Security | |
| Vendor (hosting) | |
