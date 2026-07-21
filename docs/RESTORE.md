# Restore

Procedures to restore ITU from encrypted backups. **Always restore to staging first** unless production is already down.

## Preconditions

- Backup directory verified: `./scripts/backup/verify-backup.sh .backups/<stamp>`
- `BACKUP_ENCRYPTION_KEY` available
- Target `DATABASE_URL` / Redis / volumes identified
- Change window approved; stakeholders notified
- `CONFIRM=YES` required on destructive scripts

## Restore order (full site)

1. **Secrets / env** — decrypt `app-config.tar.gz.enc`, restore `.env` and `.deploy/`
2. **PostgreSQL** — restore dump, run migrations
3. **Supabase Storage** — restore volume or re-upload objects
4. **Docker app volumes** — reconciliation / local uploads / app_data
5. **Redis** — restore RDB (or skip and rebuild cache)
6. **Deploy app** — pull SHA images, `deploy:prod` / compose up
7. **Health gate** — `/api/health`, `/api/health/ready`
8. **Smoke money path** — create-order / wallet balance (read-only first)

## PostgreSQL

```bash
export CONFIRM=YES
export DATABASE_URL='postgresql://…'   # target
export DIRECT_URL="$DATABASE_URL"
export BACKUP_ENCRYPTION_KEY='…'

./scripts/restore/restore-postgres.sh .backups/<stamp>/postgres.dump.enc
```

Then:

```bash
npm run db:migrate:production   # if not already run by script
npm run deploy:healthcheck
```

### Staging drill (recommended weekly)

1. Provision empty Postgres (or Supabase branch / clone).
2. Restore dump into staging URL.
3. Point a staging compose stack at staging DB.
4. Run health + sample admin login + read-only transaction list.
5. Record time taken → update RTO evidence in `docs/DISASTER_RECOVERY.md`.

## Redis

Redis holds cache + BullMQ state. Prefer restore when workers must resume in-flight jobs.

```bash
export CONFIRM=YES REDIS_PASSWORD='…' BACKUP_ENCRYPTION_KEY='…'
./scripts/restore/restore-redis.sh .backups/<stamp>/redis.rdb.enc
```

### Cache rebuild (no Redis backup)

If Redis is wiped intentionally:

1. Start empty Redis with `REDIS_PASSWORD`.
2. Restart `web`, `worker`, `cron`.
3. LCR routing / report caches refill on demand.
4. Re-queue any failed provider sync jobs from admin UI / cron.

## Docker volumes

```bash
export CONFIRM=YES BACKUP_ENCRYPTION_KEY='…'
./scripts/restore/restore-volumes.sh \
  .backups/<stamp>/volumes/itu-prod_app_storage_reconciliation.tar.gz.enc \
  itu-prod_app_storage_reconciliation
```

Repeat for `app_public_uploads`, `app_data` as needed. Stop `web` before restoring volumes it mounts.

## Supabase Storage

### Volume mode

```bash
export CONFIRM=YES BACKUP_ENCRYPTION_KEY='…'
./scripts/restore/restore-volumes.sh \
  .backups/<stamp>/supabase-storage-volume.tar.gz.enc \
  "$SUPABASE_STORAGE_VOLUME"
```

Restart Supabase Storage / Kong stack after restore.

### API mode

Extract `storage-objects.tar.gz[.enc]` and upload objects back with service role (or use Supabase dashboard). Prefer volume mode for self-hosted.

## Application / deployment recovery

1. Restore `.env` from encrypted app-config backup onto the host (`chmod 600`).
2. Restore `.deploy/images.env` + `current-sha` if present.
3. Deploy last known-good SHA:

```bash
export DEPLOY_SHA=<sha>
export IMAGE_WEB=ghcr.io/techantumsolutions/itu/web:<sha>
export IMAGE_SIDECAR=ghcr.io/techantumsolutions/itu/sidecar:<sha>
npm run deploy:prod
# or: npm run deploy:rollback
```

4. Confirm GHCR images still exist for that SHA; if not, rebuild from git tag/commit.

## Secrets recovery

| Secret | Recovery source |
|--------|-----------------|
| `.env` | Encrypted app-config backup + vault |
| `BACKUP_ENCRYPTION_KEY` | Offline vault / password manager (never only in `.env` backup) |
| Razorpay / OTP / JWT | Vault; rotate if host compromise suspected |
| `MASTER_ENCRYPTION_KEY` | Vault — required to decrypt provider credentials |

If the backup encryption key is lost, encrypted backups are **unrecoverable**. Store it in at least two offline locations.

## Post-restore checklist

- [ ] `verify-backup.sh` was green on the artifact used
- [ ] `/api/health` and `/api/health/ready` OK
- [ ] Redis `PING` OK
- [ ] Admin login works
- [ ] Wallet balance read works
- [ ] Sample catalog/country load works
- [ ] No critical Sentry spike
- [ ] Record incident timeline + actual RTO
