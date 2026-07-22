#!/usr/bin/env bash
# Enterprise production deploy for GHCR → SSH → K3s (primary) / Compose (legacy).
#
# After the K3s cutover, host ports :4009 and :3001 are owned by nginx → ClusterIP.
# Compose must NOT bind those ports while K3s is live (causes "address already in use").
#
# Safety model:
#   1. Record previous successful SHA for rollback
#   2. Pull git while OLD pods keep traffic
#   3. Apply DB migrations BEFORE switching app images (expand-first)
#   4. Pull immutable SHA images, import into containerd, roll Deployments
#   5. Refresh nginx edge ClusterIP upstreams
#   6. Post-deploy health gate
#   7. On health failure → automatic rollback to previous SHA
#
# Required env:
#   DEPLOY_SHA, IMAGE_WEB, IMAGE_SIDECAR, REDIS_PASSWORD
#
# Optional:
#   DEPLOY_ORCHESTRATOR=k8s|compose  — default: auto (k8s if ns/itu + itu-web exist)
#   K8S_NAMESPACE=itu
#   NEXT_PUBLIC_APP_URL / HEALTH_BASE_URL
#   SKIP_MIGRATE=1, SKIP_ROLLBACK=1
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"
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

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
: "${IMAGE_WEB:?IMAGE_WEB is required (immutable SHA tag)}"
: "${IMAGE_SIDECAR:?IMAGE_SIDECAR is required (immutable SHA tag)}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required for production Redis AUTH}"

if [[ -z "${HEALTH_BASE_URL:-}" ]]; then
  if [[ -n "${NEXT_PUBLIC_APP_URL:-}" ]]; then
    HEALTH_BASE_URL="${NEXT_PUBLIC_APP_URL%/}"
  else
    echo "ERROR: Set HEALTH_BASE_URL or NEXT_PUBLIC_APP_URL (server public URL) for post-deploy health checks"
    exit 1
  fi
fi
export HEALTH_BASE_URL REDIS_PASSWORD

if [[ "$IMAGE_WEB" == *":latest" ]] || [[ "$IMAGE_SIDECAR" == *":latest" ]]; then
  echo "ERROR: Refusing to deploy mutable :latest tags. Pass immutable SHA image refs."
  exit 1
fi

detect_orchestrator() {
  if [[ -n "${DEPLOY_ORCHESTRATOR:-}" ]]; then
    echo "$DEPLOY_ORCHESTRATOR"
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
mkdir -p "$DEPLOY_STATE_DIR"

PREVIOUS_SHA=""
if [[ -f "${DEPLOY_STATE_DIR}/current-sha" ]]; then
  PREVIOUS_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/current-sha")"
fi

cat > "$ENV_FILE" <<EOF
IMAGE_WEB=${IMAGE_WEB}
IMAGE_SIDECAR=${IMAGE_SIDECAR}
DEPLOY_SHA=${DEPLOY_SHA}
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

port_holder() {
  local port="$1"
  ss -lntp 2>/dev/null | grep -E ":${port}\\b" || true
}

assert_compose_ports_free() {
  local blocked=0
  if ss -lntp 2>/dev/null | grep -qE ':4009\b'; then
    echo "ERROR: host :4009 is already bound — Compose web cannot start."
    port_holder 4009
    blocked=1
  fi
  if ss -lntp 2>/dev/null | grep -qE ':3001\b'; then
    echo "ERROR: host :3001 is already bound — Compose socket cannot start."
    port_holder 3001
    blocked=1
  fi
  if [[ "$blocked" -eq 1 ]]; then
    echo
    echo "Production edge is K3s + nginx (see ${NGINX_EDGE_CONF})."
    echo "Do NOT run Compose app deploy while nginx owns these ports."
    echo "Use DEPLOY_ORCHESTRATOR=k8s (auto) or remove the nginx edge only for emergency Compose rollback."
    echo
    echo "Rejected unsafe cleanup ideas:"
    echo "  - docker stop \$(docker ps -q)   # would kill Supabase and other tenants"
    echo "  - changing socket to a random host port without updating nginx/clients"
    exit 1
  fi
}

image_digest_ref() {
  # Prefer RepoDigest (immutable). Falls back to tag ref if digest missing.
  local ref="$1"
  local dig
  dig="$(docker image inspect "$ref" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
  if [[ -n "$dig" && "$dig" == *@sha256:* ]]; then
    echo "$dig"
  else
    echo "$ref"
  fi
}

import_images_to_k3s() {
  echo "==> Importing images into K3s containerd"
  docker pull "$IMAGE_WEB"
  docker pull "$IMAGE_SIDECAR"
  docker save "$IMAGE_WEB" "$IMAGE_SIDECAR" | k3s ctr images import -
}

refresh_nginx_edge() {
  if [[ ! -x "$NGINX_BIN" ]]; then
    echo "WARN: nginx binary not found at $NGINX_BIN — skipping edge refresh"
    return 0
  fi
  if [[ ! -f "$ROOT/k8s/scripts/cutover-nginx.sh" ]]; then
    echo "WARN: cutover-nginx.sh missing — skipping edge refresh"
    return 0
  fi
  echo "==> Refreshing nginx edge → current ClusterIPs"
  NS="$K8S_NAMESPACE" CONF="$NGINX_EDGE_CONF" NGINX_BIN="$NGINX_BIN" \
    bash "$ROOT/k8s/scripts/cutover-nginx.sh"
}

deploy_k8s() {
  local web_ref sidecar_ref
  import_images_to_k3s
  web_ref="$(image_digest_ref "$IMAGE_WEB")"
  sidecar_ref="$(image_digest_ref "$IMAGE_SIDECAR")"
  echo "    web_ref=${web_ref}"
  echo "    sidecar_ref=${sidecar_ref}"

  # Ensure Compose app containers are not fighting K3s (ignore if absent).
  compose stop web socket worker cron system-plans-availability system-plans-merge 2>/dev/null || true
  compose rm -f web socket worker cron system-plans-availability system-plans-merge 2>/dev/null || true

  echo "==> Rolling K8s Deployments in ns/${K8S_NAMESPACE}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-web web="${web_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-socket socket="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-worker worker="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-cron cron="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-system-plans-availability system-plans-availability="${sidecar_ref}"
  kubectl -n "$K8S_NAMESPACE" set image deploy/itu-system-plans-merge system-plans-merge="${sidecar_ref}"

  # Keep APP_VERSION in ConfigMap aligned with deploy SHA (best-effort).
  kubectl -n "$K8S_NAMESPACE" patch configmap itu-config --type merge \
    -p "{\"data\":{\"APP_VERSION\":\"${DEPLOY_SHA}\"}}" >/dev/null || true

  for d in itu-web itu-socket itu-worker itu-cron itu-system-plans-availability itu-system-plans-merge; do
    kubectl -n "$K8S_NAMESPACE" rollout status "deploy/${d}" --timeout=300s
  done

  refresh_nginx_edge
}

dump_k8s_diagnostics() {
  echo "==> K8s diagnostics"
  kubectl -n "$K8S_NAMESPACE" get pods,deploy,svc,scaledobject,hpa || true
  kubectl -n "$K8S_NAMESPACE" logs -l app=itu-web --tail=100 || true
  kubectl -n "$K8S_NAMESPACE" describe deploy itu-web | tail -40 || true
}

dump_stack_diagnostics() {
  if [[ "$ORCH" == "k8s" ]]; then
    dump_k8s_diagnostics
  else
    echo "==> Stack diagnostics (compose ps + recent logs)"
    compose ps -a || true
    echo "---- web (last 150 lines) ----"
    compose logs --tail=150 web || true
    echo "---- redis (last 50 lines) ----"
    compose logs --tail=50 redis || true
    echo "---- socket (last 50 lines) ----"
    compose logs --tail=50 socket || true
  fi
}

deploy_compose() {
  assert_compose_ports_free
  echo "==> Pulling immutable images (Compose)"
  compose pull
  echo "==> Recreating Compose stack on SHA ${DEPLOY_SHA}"
  if ! compose up -d --remove-orphans --wait --wait-timeout 300; then
    echo "WARN: compose --wait failed or unsupported; dumping diagnostics then falling back to up -d"
    dump_stack_diagnostics
    compose up -d --remove-orphans
  fi
}

echo "==> Deploy SHA ${DEPLOY_SHA}"
echo "    orchestrator=${ORCH}"
echo "    previous=${PREVIOUS_SHA:-<none>}"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"
echo "    HEALTH_BASE_URL=${HEALTH_BASE_URL}"
echo "    REDIS_PASSWORD=<set>"

# ── 1) Migrations BEFORE traffic switch ─────────────────────────────────────
if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  echo "==> Applying database migrations (before image cutover)"
  npm run db:migrate:production
else
  echo "==> Skipping migrations (SKIP_MIGRATE=1)"
fi

# ── 2–3) Cut over ───────────────────────────────────────────────────────────
if [[ "$ORCH" == "k8s" ]]; then
  deploy_k8s
elif [[ "$ORCH" == "compose" ]]; then
  deploy_compose
else
  echo "ERROR: Unknown DEPLOY_ORCHESTRATOR=${ORCH} (expected k8s|compose)"
  exit 1
fi

# ── 4) Health gate ──────────────────────────────────────────────────────────
echo "==> Post-deploy health verification"
set +e
HEALTH_BASE_URL="$HEALTH_BASE_URL" DEPLOY_ENV_FILE="$ENV_FILE" REDIS_PASSWORD="$REDIS_PASSWORD" \
  DEPLOY_ORCHESTRATOR="$ORCH" K8S_NAMESPACE="$K8S_NAMESPACE" \
  bash scripts/deploy-healthcheck.sh
HEALTH_RC=$?
set -e

if [[ "$HEALTH_RC" -ne 0 ]]; then
  echo "ERROR: Health gate failed for SHA ${DEPLOY_SHA}"
  dump_stack_diagnostics
  if [[ "${SKIP_ROLLBACK:-0}" == "1" ]]; then
    echo "SKIP_ROLLBACK=1 — leaving failed release in place"
    exit 1
  fi
  if [[ -z "$PREVIOUS_SHA" || "$PREVIOUS_SHA" == "$DEPLOY_SHA" ]]; then
    echo "ERROR: No distinct previous SHA available for automatic rollback"
    exit 1
  fi
  echo "==> Triggering automatic rollback to ${PREVIOUS_SHA}"
  echo "$DEPLOY_SHA" > "${DEPLOY_STATE_DIR}/current-sha"
  DEPLOY_ORCHESTRATOR="$ORCH" bash scripts/deploy-rollback.sh "$PREVIOUS_SHA"
  echo "ERROR: Deploy of ${DEPLOY_SHA} failed; rolled back to ${PREVIOUS_SHA}"
  exit 1
fi

# ── 5) Record success ───────────────────────────────────────────────────────
if [[ -n "$PREVIOUS_SHA" && "$PREVIOUS_SHA" != "$DEPLOY_SHA" ]]; then
  echo "$PREVIOUS_SHA" > "${DEPLOY_STATE_DIR}/previous-sha"
fi
echo "$DEPLOY_SHA" > "${DEPLOY_STATE_DIR}/current-sha"
echo "$ORCH" > "${DEPLOY_STATE_DIR}/orchestrator"

docker image prune -f >/dev/null || true

echo "==> Deploy SUCCESS (${ORCH}): ${DEPLOY_SHA}"
echo "    previous-sha=$(cat "${DEPLOY_STATE_DIR}/previous-sha" 2>/dev/null || echo none)"
