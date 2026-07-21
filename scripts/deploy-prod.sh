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
#
# Optional:
#   SKIP_MIGRATE=1      — skip migrations (emergency image-only rollback path uses deploy-rollback.sh)
#   SKIP_ROLLBACK=1     — fail without auto-rollback (for debugging)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-${DEPLOY_STATE_DIR}/images.env}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://127.0.0.1:4009}"

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
: "${IMAGE_WEB:?IMAGE_WEB is required (immutable SHA tag)}"
: "${IMAGE_SIDECAR:?IMAGE_SIDECAR is required (immutable SHA tag)}"

if [[ "$IMAGE_WEB" == *":latest" ]] || [[ "$IMAGE_SIDECAR" == *":latest" ]]; then
  echo "ERROR: Refusing to deploy mutable :latest tags. Pass immutable SHA image refs."
  exit 1
fi

mkdir -p "$DEPLOY_STATE_DIR"

PREVIOUS_SHA=""
if [[ -f "${DEPLOY_STATE_DIR}/current-sha" ]]; then
  PREVIOUS_SHA="$(tr -d '[:space:]' < "${DEPLOY_STATE_DIR}/current-sha")"
fi

# Persist image pins for all subsequent compose invocations.
cat > "$ENV_FILE" <<EOF
IMAGE_WEB=${IMAGE_WEB}
IMAGE_SIDECAR=${IMAGE_SIDECAR}
DEPLOY_SHA=${DEPLOY_SHA}
EOF

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "==> Deploy SHA ${DEPLOY_SHA}"
echo "    previous=${PREVIOUS_SHA:-<none>}"
echo "    IMAGE_WEB=${IMAGE_WEB}"
echo "    IMAGE_SIDECAR=${IMAGE_SIDECAR}"

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
HEALTH_BASE_URL="$HEALTH_BASE_URL" DEPLOY_ENV_FILE="$ENV_FILE" \
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
