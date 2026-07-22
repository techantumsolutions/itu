#!/usr/bin/env bash
# Rollback production compose stack to a previously successful immutable SHA.
#
# Usage:
#   bash scripts/deploy-rollback.sh              # uses .deploy/previous-sha
#   bash scripts/deploy-rollback.sh <git-sha>    # explicit SHA
#
# Does NOT reverse database migrations (expand/contract: schema stays forward).
# Restores IMAGE_WEB / IMAGE_SIDECAR to the target SHA and recreates the stack.
#
# Required:
#   REDIS_PASSWORD — Redis AUTH (export or VPS .env)
# Optional:
#   NEXT_PUBLIC_APP_URL / HEALTH_BASE_URL — health probe base (public server URL)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"
IMAGE_WEB_REPO="${IMAGE_WEB_REPO:-ghcr.io/techantumsolutions/itu/web}"
IMAGE_SIDECAR_REPO="${IMAGE_SIDECAR_REPO:-ghcr.io/techantumsolutions/itu/sidecar}"

load_env_key() {
  local key="$1"
  local file="${2:-.env}"
  local line val
  if [[ -n "${!key:-}" ]]; then
    return 0
  fi
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  val="${line#"${key}="}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\".*\"$ ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" =~ ^\'.*\'$ ]]; then
    val="${val:1:${#val}-2}"
  fi
  export "$key=$val"
}

load_env_key REDIS_PASSWORD
load_env_key NEXT_PUBLIC_APP_URL

: "${REDIS_PASSWORD:?REDIS_PASSWORD is required for production Redis AUTH}"

if [[ -z "${HEALTH_BASE_URL:-}" ]]; then
  if [[ -n "${NEXT_PUBLIC_APP_URL:-}" ]]; then
    HEALTH_BASE_URL="${NEXT_PUBLIC_APP_URL%/}"
  else
    echo "ERROR: Set HEALTH_BASE_URL or NEXT_PUBLIC_APP_URL for health checks"
    exit 1
  fi
fi
export HEALTH_BASE_URL REDIS_PASSWORD

mkdir -p "$DEPLOY_STATE_DIR"

TARGET_SHA="${1:-}"
if [[ -z "$TARGET_SHA" ]]; then
  if [[ ! -f "${DEPLOY_STATE_DIR}/previous-sha" ]]; then
    echo "ERROR: No previous successful SHA recorded at ${DEPLOY_STATE_DIR}/previous-sha"
    echo "Pass an explicit SHA: bash scripts/deploy-rollback.sh <sha>"
    exit 1
  fi
  TARGET_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/previous-sha")"
fi

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "ERROR: Invalid SHA '${TARGET_SHA}'"
  exit 1
fi

export IMAGE_WEB="${IMAGE_WEB_REPO}:${TARGET_SHA}"
export IMAGE_SIDECAR="${IMAGE_SIDECAR_REPO}:${TARGET_SHA}"

cat > "$ENV_FILE" <<EOF
IMAGE_WEB=${IMAGE_WEB}
IMAGE_SIDECAR=${IMAGE_SIDECAR}
DEPLOY_SHA=${TARGET_SHA}
REDIS_PASSWORD=${REDIS_PASSWORD}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-}
EOF
chmod 600 "$ENV_FILE"

compose() {
  local args=()
  if [[ -f .env ]]; then
    args+=(--env-file .env)
  fi
  args+=(--env-file "$ENV_FILE")
  docker compose "${args[@]}" -f "$COMPOSE_FILE" "$@"
}

echo "==> Rollback to SHA ${TARGET_SHA}"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"
echo "    HEALTH_BASE_URL=${HEALTH_BASE_URL}"

compose pull web socket worker cron system-plans-availability system-plans-merge
compose up -d --remove-orphans --wait --wait-timeout 180 || compose up -d --remove-orphans

HEALTH_BASE_URL="$HEALTH_BASE_URL" DEPLOY_ENV_FILE="$ENV_FILE" REDIS_PASSWORD="$REDIS_PASSWORD" \
  bash scripts/deploy-healthcheck.sh

# On successful rollback, current becomes the rollback target; keep prior current as previous if present.
if [[ -f "${DEPLOY_STATE_DIR}/current-sha" ]]; then
  FAILED_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/current-sha")"
  if [[ "$FAILED_SHA" != "$TARGET_SHA" ]]; then
    echo "$FAILED_SHA" > "${DEPLOY_STATE_DIR}/previous-sha"
  fi
fi
echo "$TARGET_SHA" > "${DEPLOY_STATE_DIR}/current-sha"

echo "==> Rollback complete: now running ${TARGET_SHA}"
