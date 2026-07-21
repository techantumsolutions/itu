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
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"
IMAGE_WEB_REPO="${IMAGE_WEB_REPO:-ghcr.io/techantumsolutions/itu/web}"
IMAGE_SIDECAR_REPO="${IMAGE_SIDECAR_REPO:-ghcr.io/techantumsolutions/itu/sidecar}"

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
EOF

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "==> Rollback to SHA ${TARGET_SHA}"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"

compose pull web socket worker cron system-plans-availability system-plans-merge
compose up -d --remove-orphans --wait --wait-timeout 180 || compose up -d --remove-orphans

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
