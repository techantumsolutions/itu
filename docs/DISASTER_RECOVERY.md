# Disaster Recovery

End-to-end disaster recovery (DR) plan for ITU production.

Related docs: [BACKUP.md](./BACKUP.md) · [RESTORE.md](./RESTORE.md) · [RUNBOOK.md](./RUNBOOK.md) · ADR [005](./adr/005-financial-least-privilege-rls.md)

## Recovery objectives

| Objective | Target | Measurement |
|-----------|--------|-------------|
| **RPO** | 24h (daily backup); 15m with WAL/PITR | Age of last verified backup / WAL |
| **RTO** | 4h full site; 1h DB-only | Wall clock from declare → health green |
| Backup retention | 30 days | `BACKUP_RETENTION_DAYS` |
| Offsite | ≥ 1 geographic copy | rclone/S3 verification |

Review objectives quarterly.

## System map

```
Clients → web (Next.js) → PostgREST (service_role) → Postgres
                ↘ Redis (cache + BullMQ)
                ↘ Supabase Storage (avatars/tickets)
Workers/cron → Redis + Postgres
```

Critical data: **Postgres** (money, catalog, auth profiles).  
Rebuildable: Redis cache, most report caches.  
Important: Storage objects, reconciliation volumes, `.env` secrets.

## Disaster scenarios

### 1. Postgres data corruption / accidental DROP

1. Stop writers (`web`, `worker`, `cron`) to prevent further damage.
2. Restore latest verified dump to staging; validate.
3. Restore to production (or promote staging).
4. Run migrations; health gate; smoke tests.
5. **RPO:** last dump age. **RTO:** ~1–3h.

### 2. Entire VM / host loss

1. Provision replacement host + Docker + networks (`itu`, `supabase_default`).
2. Restore secrets from vault + encrypted app-config backup.
3. Restore Postgres (and Storage volume).
4. Restore app volumes if needed.
5. Pull GHCR SHA images; `deploy:prod`.
6. Redis: restore RDB or cold-start + rebuild.
7. **RTO:** ~2–4h with offsite backups ready.

### 3. Redis loss / corruption

1. Prefer empty Redis + restart workers (cache rebuild).
2. If BullMQ jobs must resume, restore RDB.
3. Re-run provider sync cron if jobs were lost.
4. **RPO/RTO:** minutes; low business impact if cache-only.

### 4. Supabase Storage loss

1. Restore storage volume or re-upload from `storage-objects` archive.
2. Verify public avatar/ticket URLs.
3. **RTO:** ~1h.

### 5. Secrets leak / host compromise

1. Rotate all secrets (DB password, service_role, JWT, Redis, Razorpay, OTP, encryption keys).
2. Revoke GHCR deploy credentials if needed.
3. Redeploy with new `.env`.
4. Treat backups taken during compromise as suspect.
5. Follow security incident process (not only DR).

### 6. Bad deploy / app regression

1. Prefer `npm run deploy:rollback` (SHA pin) — **not** a data restore.
2. Use DB restore only if migration caused irreversible data loss.

### 7. Region / network outage

1. Fail over DNS to warm standby if configured.
2. Otherwise wait for provider; communicate status page.
3. Ensure offsite backups remain accessible independently of primary host.

## DR workflow (summary)

```
Detect → Declare incident → Freeze writes (if data risk)
  → Select restore point (verified backup)
  → Restore staging → Validate
  → Restore / promote production
  → Deploy known-good images
  → Health + smoke
  → Monitor → Postmortem
```

## Roles

| Role | Responsibility |
|------|----------------|
| Incident commander | Declare DR, approve CONFIRM=YES restores |
| DBA / SRE | Execute backup/restore scripts |
| App owner | Smoke money path + admin |
| Comms | Status updates to stakeholders |

## Evidence & drills

- Keep last **successful verify** log under `/var/log/itu-backup-verify.log`.
- Monthly: restore Postgres dump to staging; attach timing to this doc.
- Quarterly: full VM rebuild from offsite backups (game day).

## Dependencies outside this repo

- Offsite object storage credentials
- DNS / TLS certificates
- GHCR access for image pull
- Supabase stack compose (external network `supabase_default`)
- Vault for `BACKUP_ENCRYPTION_KEY` (must survive loss of app host)
