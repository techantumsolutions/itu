#!/usr/bin/env bash
# Backup application environment + deploy pins (encrypted).
# Never commit output. Requires BACKUP_ENCRYPTION_KEY in production.
set -euo pipefail
# shellcheck source=scripts/backup/_lib.sh
source "$(cd "$(dirname "$0")" && pwd)/_lib.sh"

OUT_DIR="$RUN_DIR/app-config"
mkdir -p "$OUT_DIR"

if [[ -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env" "$OUT_DIR/dotenv"
else
  log "WARN: .env not found"
fi

if [[ -d "$ROOT/.deploy" ]]; then
  tar -czf "$OUT_DIR/deploy-state.tar.gz" -C "$ROOT" .deploy
fi

# Redacted inventory of required keys (names only) for recovery checklists.
{
  echo "# Secret key inventory (names only) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "DATABASE_URL"
  echo "SUPABASE_URL"
  echo "SUPABASE_SERVICE_ROLE_KEY"
  echo "SUPABASE_JWT_SECRET"
  echo "REDIS_PASSWORD"
  echo "REDIS_URL"
  echo "RAZORPAY_KEY_ID"
  echo "RAZORPAY_KEY_SECRET"
  echo "MASTER_ENCRYPTION_KEY"
  echo "OTP_SESSION_SECRET"
  echo "PAYMENT_WEBHOOK_SECRET"
  echo "SENTRY_DSN"
  echo "BACKUP_ENCRYPTION_KEY"
} >"$OUT_DIR/secret-names.txt"

ARCHIVE="$RUN_DIR/app-config.tar.gz"
tar -czf "$ARCHIVE" -C "$OUT_DIR" .
write_manifest_line "app-config" "$ARCHIVE"

if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  die "BACKUP_ENCRYPTION_KEY is required to backup .env / deploy state"
fi
encrypt_file "$ARCHIVE"
write_manifest_line "app-config" "${ARCHIVE}.enc"
rm -rf "$OUT_DIR"
log "App config backup complete (encrypted)"
