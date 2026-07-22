#!/usr/bin/env bash
# Enterprise production deploy for GHCR → SSH → Docker Compose.
#
# Safety model:
#   1. Record previous successful SHA for rollback
#   2. Pull git (compose + migration scripts) while OLD containers keep traffic
#   3. Apply DB migrations BEFORE switching app images (expand-first)
#   4. Pull + recreate stack on immutable SHA tags (not :latest)
#   5. Post-deploy health gate (/api/health, /api/health/ready, Redis, DB)
#   6. On health failure → automatic rollback to previous SHA
#
# Required env:
#   DEPLOY_SHA          — full git commit SHA being deployed
#   IMAGE_WEB           — full ref including tag, e.g. ghcr.io/.../web:<sha>
#   IMAGE_SIDECAR       — full ref including tag, e.g. ghcr.io/.../sidecar:<sha>
#   REDIS_PASSWORD      — Redis AUTH (GitHub secret or VPS .env)
#
# Optional:
#   NEXT_PUBLIC_APP_URL — used to derive HEALTH_BASE_URL (server public URL)
#   HEALTH_BASE_URL     — override health probe base (defaults from NEXT_PUBLIC_APP_URL)
#   SKIP_MIGRATE=1      — skip migrations (emergency image-only rollback path uses deploy-rollback.sh)
#   SKIP_ROLLBACK=1     — fail without auto-rollback (for debugging)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"

# Load selected keys from VPS .env when not already exported (does not override CI/SSH exports).
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

# Health probes use the public app URL (not a hardcoded loopback).
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

mkdir -p "$DEPLOY_STATE_DIR"

PREVIOUS_SHA=""
if [[ -f "${DEPLOY_STATE_DIR}/current-sha" ]]; then
  PREVIOUS_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/current-sha")"
fi

# Persist image pins for compose. Include REDIS_PASSWORD so --env-file alone can interpolate
# docker-compose.prod.yml (Compose does not auto-merge project .env when --env-file is set).
cat > "$ENV_FILE" <<EOF
IMAGE_WEB=${IMAGE_WEB}
IMAGE_SIDECAR=${IMAGE_SIDECAR}
DEPLOY_SHA=${DEPLOY_SHA}
REDIS_PASSWORD=${REDIS_PASSWORD}
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-}
EOF
chmod 600 "$ENV_FILE"

compose() {
  # Prefer project .env (if present) then images.env so local secrets + deploy pins both apply.
  local args=()
  if [[ -f .env ]]; then
    args+=(--env-file .env)
  fi
  args+=(--env-file "$ENV_FILE")
  docker compose "${args[@]}" -f "$COMPOSE_FILE" "$@"
}

echo "==> Deploy SHA ${DEPLOY_SHA}"
echo "    previous=${PREVIOUS_SHA:-<none>}"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"
echo "    HEALTH_BASE_URL=${HEALTH_BASE_URL}"
echo "    REDIS_PASSWORD=<set>"

# ── 1) Migrations BEFORE traffic switch ─────────────────────────────────────
# Old containers continue serving while additive schema changes are applied.
# Strategy: expand/contract — new schema must be backward-compatible with the
# currently running image until cutover completes.
if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  echo "==> Applying database migrations (before image cutover)"
  npm run db:migrate:production
else
  echo "==> Skipping migrations (SKIP_MIGRATE=1)"
fi

# ── 2) Pull immutable SHA images ────────────────────────────────────────────
echo "==> Pulling immutable images"
compose pull

# ── 3) Cut over containers ──────────────────────────────────────────────────
# Single-replica compose recreate is not true multi-instance blue/green, but
# migrating first + --wait on healthchecks minimizes the unsafe window versus
# the previous "up then migrate" order.
echo "==> Recreating stack on SHA ${DEPLOY_SHA}"
if ! compose up -d --remove-orphans --wait --wait-timeout 180; then
  echo "WARN: compose --wait failed or unsupported; falling back to up -d"
  compose up -d --remove-orphans
fi

# ── 4) Health gate ──────────────────────────────────────────────────────────
echo "==> Post-deploy health verification"
set +e
HEALTH_BASE_URL="$HEALTH_BASE_URL" DEPLOY_ENV_FILE="$ENV_FILE" REDIS_PASSWORD="$REDIS_PASSWORD" \
  bash scripts/deploy-healthcheck.sh
HEALTH_RC=$?
set -e

if [[ "$HEALTH_RC" -ne 0 ]]; then
  echo "ERROR: Health gate failed for SHA ${DEPLOY_SHA}"
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
  bash scripts/deploy-rollback.sh "$PREVIOUS_SHA"
  echo "ERROR: Deploy of ${DEPLOY_SHA} failed; rolled back to ${PREVIOUS_SHA}"
  exit 1
fi

# ── 5) Record success + retain previous for next rollback ───────────────────
if [[ -n "$PREVIOUS_SHA" && "$PREVIOUS_SHA" != "$DEPLOY_SHA" ]]; then
  echo "$PREVIOUS_SHA" > "${DEPLOY_STATE_DIR}/previous-sha"
fi
echo "$DEPLOY_SHA" > "${DEPLOY_STATE_DIR}/current-sha"

# Prune dangling layers only; keep tagged previous+current images for rollback.
docker image prune -f >/dev/null || true

echo "==> Deploy SUCCESS: ${DEPLOY_SHA}"
echo "    previous-sha=$(cat "${DEPLOY_STATE_DIR}/previous-sha" 2>/dev/null || echo none)"
