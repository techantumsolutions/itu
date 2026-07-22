#!/usr/bin/env bash
# Rollback production to a previously successful immutable SHA (K3s primary / Compose legacy).
#
# Usage:
#   bash scripts/deploy-rollback.sh              # uses .deploy/previous-sha
#   bash scripts/deploy-rollback.sh <git-sha>    # explicit SHA
#
# Does NOT reverse database migrations (expand/contract: schema stays forward).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"
IMAGE_WEB_REPO="${IMAGE_WEB_REPO:-ghcr.io/techantumsolutions/itu/web}"
IMAGE_SIDECAR_REPO="${IMAGE_SIDECAR_REPO:-ghcr.io/techantumsolutions/itu/sidecar}"
K8S_NAMESPACE="${K8S_NAMESPACE:-itu}"
NGINX_EDGE_CONF="${NGINX_EDGE_CONF:-/www/server/panel/vhost/nginx/itu-k3s-edge.conf}"
NGINX_BIN="${NGINX_BIN:-/www/server/nginx/sbin/nginx}"

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

detect_orchestrator() {
  if [[ -n "${DEPLOY_ORCHESTRATOR:-}" ]]; then
    echo "$DEPLOY_ORCHESTRATOR"
    return
  fi
  if [[ -f "${DEPLOY_STATE_DIR}/orchestrator" ]]; then
    tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/orchestrator"
    return
  fi
  if command -v kubectl >/dev/null 2>&1 \
    && kubectl get ns "$K8S_NAMESPACE" >/dev/null 2>&1 \
    && kubectl -n "$K8S_NAMESPACE" get deploy itu-web >/dev/null 2>&1; then
    echo "k8s"
    return
  fi
  echo "compose"
}

ORCH="$(detect_orchestrator)"

export IMAGE_WEB="${IMAGE_WEB_REPO}:${TARGET_SHA}"
export IMAGE_SIDECAR="${IMAGE_SIDECAR_REPO}:${TARGET_SHA}"

cat > "$ENV_FILE" <<EOF
IMAGE_WEB=${IMAGE_WEB}
IMAGE_SIDECAR=${IMAGE_SIDECAR}
DEPLOY_SHA=${TARGET_SHA}
REDIS_PASSWORD=${REDIS_PASSWORD}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-}
DEPLOY_ORCHESTRATOR=${ORCH}
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

image_digest_ref() {
  local ref="$1"
  local dig
  dig="$(docker image inspect "$ref" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
  if [[ -n "$dig" && "$dig" == *@sha256:* ]]; then
    echo "$dig"
  else
    echo "$ref"
  fi
}

echo "==> Rollback to SHA ${TARGET_SHA} (orchestrator=${ORCH})"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"
echo "    HEALTH_BASE_URL=${HEALTH_BASE_URL}"

if [[ "$ORCH" == "k8s" ]]; then
  docker pull "$IMAGE_WEB"
  docker pull "$IMAGE_SIDECAR"
  docker save "$IMAGE_WEB" "$IMAGE_SIDECAR" | k3s ctr images import -
  web_ref="$(image_digest_ref "$IMAGE_WEB")"
  sidecar_ref="$(image_digest_ref "$IMAGE_SIDECAR")"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-web web="${web_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-socket socket="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-worker worker="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-cron cron="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-system-plans-availability system-plans-availability="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-system-plans-merge system-plans-merge="${sidecar_ref}"
  for d in itu-web itu-socket itu-worker itu-cron itu-system-plans-availability itu-system-plans-merge; do
    kubectl -n "$K8S_NAMESPACE" rollout status "deploy/${d}" --timeout=300s
  done
  if [[ -x "$NGINX_BIN" && -f "$ROOT/k8s/scripts/cutover-nginx.sh" ]]; then
    NS="$K8S_NAMESPACE" CONF="$NGINX_EDGE_CONF" NGINX_BIN="$NGINX_BIN" \
      bash "$ROOT/k8s/scripts/cutover-nginx.sh" || true
  fi
else
  if ss -lntp 2>/dev/null | grep -qE ':(4009|3001)\b'; then
    echo "ERROR: Cannot Compose-rollback while nginx/K3s owns :4009/:3001."
    echo "Remove ${NGINX_EDGE_CONF} and reload nginx only for emergency Compose rollback."
    exit 1
  fi
  compose pull web socket worker cron system-plans-availability system-plans-merge
  compose up -d --remove-orphans --wait --wait-timeout 180 || compose up -d --remove-orphans
fi

HEALTH_BASE_URL="$HEALTH_BASE_URL" DEPLOY_ENV_FILE="$ENV_FILE" REDIS_PASSWORD="$REDIS_PASSWORD" \
  DEPLOY_ORCHESTRATOR="$ORCH" K8S_NAMESPACE="$K8S_NAMESPACE" \
  bash scripts/deploy-healthcheck.sh

if [[ -f "${DEPLOY_STATE_DIR}/current-sha" ]]; then
  FAILED_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/current-sha")"
  if [[ "$FAILED_SHA" != "$TARGET_SHA" ]]; then
    echo "$FAILED_SHA" > "${DEPLOY_STATE_DIR}/previous-sha"
  fi
fi
echo "$TARGET_SHA" > "${DEPLOY_STATE_DIR}/current-sha"
echo "$ORCH" > "${DEPLOY_STATE_DIR}/orchestrator"

echo "==> Rollback complete: now running ${TARGET_SHA} (${ORCH})"
