# Backup

Enterprise backup procedures for ITU production (self-hosted Supabase Postgres + Docker Compose app stack).

## Objectives

| Metric | Target | Notes |
|--------|--------|--------|
| **RPO** | ≤ 24 hours (daily); ≤ 15 minutes with WAL/PITR | Daily encrypted dumps are mandatory. PITR optional for lower RPO. |
| **RTO** | ≤ 4 hours (full site); ≤ 1 hour (DB-only) | Assumes warm standby host or same host with spare capacity. |
| Retention | 30 days daily (configurable) | `BACKUP_RETENTION_DAYS` |

## What is backed up

| Component | Method | Script |
|-----------|--------|--------|
| PostgreSQL | `pg_dump --format=custom` + AES-256-CBC | `scripts/backup/backup-postgres.sh` |
| Redis | `BGSAVE` RDB (+ AOF if present) | `scripts/backup/backup-redis.sh` |
| App Docker volumes | `tar.gz` of named volumes | `scripts/backup/backup-volumes.sh` |
| Supabase Storage | Volume tar **or** Storage API | `scripts/backup/backup-storage.sh` |
| Secrets / deploy pins | Encrypted `.env` + `.deploy` | `scripts/backup/backup-env.sh` |

Orchestrator: `scripts/backup/backup-all.sh`

## Schedule

See `scripts/backup/crontab.example`:

- **02:15 UTC** — full backup
- **03:00 UTC** — verify latest backup
- **Weekly** — staging restore drill (ops calendar)

## Encryption

Set `BACKUP_ENCRYPTION_KEY` (32+ random bytes, base64). Backups are encrypted with OpenSSL AES-256-CBC + PBKDF2.  
**Production rule:** refuse to leave `.env` plaintext — `backup-env.sh` requires the key.

```bash
openssl rand -base64 32   # store in /etc/itu/backup.env (root-only)
```

## Required environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` / `DIRECT_URL` | Postgres dump source |
| `REDIS_PASSWORD` | Redis AUTH for BGSAVE |
| `BACKUP_ENCRYPTION_KEY` | At-rest encryption |
| `BACKUP_ROOT` | Default `.backups/` |
| `BACKUP_RETENTION_DAYS` | Default `30` |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Storage API mode |
| `SUPABASE_STORAGE_VOLUME` | Preferred self-hosted Storage volume name |

## Run manually

```bash
export $(grep -v '^#' /etc/itu/backup.env | xargs)   # or set vars
cd /opt/itu
./scripts/backup/backup-all.sh
./scripts/backup/verify-backup.sh
```

npm shortcuts:

```bash
npm run backup:all
npm run backup:verify
```

## Point-in-time recovery (PITR)

Daily dumps alone do **not** provide PITR. For RPO much lower than 24 hours:

### Option A — Supabase hosted

Enable **Point in Time Recovery** in the Supabase project dashboard (Pro+). Follow Supabase restore docs; keep ITU app images pinned by SHA during cutover.

### Option B — Self-hosted Postgres (recommended for this stack)

1. Set `wal_level = replica` (or `logical`) in Postgres.
2. Configure `archive_command` to copy WAL to durable storage (S3/MinIO/NFS), e.g.  
   `archive_command = 'test ! -f /wal_archive/%f && cp %p /wal_archive/%f'`
3. Take a base backup regularly (`pg_basebackup` or continue daily `pg_dump` + WAL).
4. Restore: restore base → replay WAL to target timestamp (`recovery_target_time`).

Document the archive location and access keys in the secrets vault (not git).

## Offsite copy

After local backup succeeds, copy `$BACKUP_ROOT/<stamp>` to offsite storage (S3/B2/rsync). Example:

```bash
rclone copy "$BACKUP_ROOT/latest" remote:itu-backups/$(basename "$(readlink -f "$BACKUP_ROOT/latest")")
```

Offsite retention should match or exceed local retention.

## Verification

Always run `scripts/backup/verify-backup.sh` after backup. It checks:

- Manifest SHA-256 for every artifact
- `pg_restore --list` on the Postgres dump

Weekly: perform a **staging restore drill** (`docs/RESTORE.md`).
