#!/usr/bin/env bash
# Create / update itu-app-secrets from /var/www/itu/.env without printing values.
# Usage: ./k8s/scripts/create-secrets.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/itu/.env}"
NS="${NS:-itu}"
SECRET_NAME="${SECRET_NAME:-itu-app-secrets}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

kubectl get ns "$NS" >/dev/null

# Build a filtered env file (KEY=VALUE) for kubectl --from-env-file.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Keep only simple KEY=VALUE lines; strip quotes optionally.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  # Skip empty keys / invalid names
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  # Strip surrounding single/double quotes
  if [[ "$val" =~ ^\".*\"$ ]]; then val="${val:1:-1}"; fi
  if [[ "$val" =~ ^\'.*\'$ ]]; then val="${val:1:-1}"; fi
  printf '%s=%s\n' "$key" "$val" >>"$TMP"
done <"$ENV_FILE"

# Ensure REDIS_PASSWORD exists
if ! grep -q '^REDIS_PASSWORD=' "$TMP"; then
  echo "ERROR: REDIS_PASSWORD missing from $ENV_FILE" >&2
  exit 1
fi

KEY_COUNT="$(grep -c '=' "$TMP" || true)"
echo "Applying secret $SECRET_NAME in ns/$NS ($KEY_COUNT keys) — values not printed"

kubectl -n "$NS" create secret generic "$SECRET_NAME" \
  --from-env-file="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "$NS" label secret "$SECRET_NAME" \
  app.kubernetes.io/part-of=itu --overwrite >/dev/null

echo "OK: secret/$SECRET_NAME applied"
