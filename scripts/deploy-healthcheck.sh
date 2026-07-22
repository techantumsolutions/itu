#!/usr/bin/env bash
# Post-deploy health gate for production (K3s primary, Compose legacy).
#
# Verifies:
#   1. GET /api/health          (liveness)
#   2. GET /api/health/ready    (Redis + Supabase / database path)
#   3. Redis PING (K8s itu-redis or Compose redis)
#   4. Postgres reachable via Supabase DB container
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${DEPLOY_ENV_FILE:-.deploy/images.env}"
RETRIES="${HEALTH_RETRIES:-24}"
SLEEP_SECS="${HEALTH_SLEEP_SECS:-5}"
K8S_NAMESPACE="${K8S_NAMESPACE:-itu}"

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
if [[ -f "$ENV_FILE" ]]; then
  load_env_key REDIS_PASSWORD "$ENV_FILE"
  load_env_key NEXT_PUBLIC_APP_URL "$ENV_FILE"
  load_env_key DEPLOY_ORCHESTRATOR "$ENV_FILE"
fi

if [[ -z "${HEALTH_BASE_URL:-}" ]]; then
  if [[ -n "${NEXT_PUBLIC_APP_URL:-}" ]]; then
    HEALTH_BASE_URL="${NEXT_PUBLIC_APP_URL%/}"
  else
    echo "ERROR: HEALTH_BASE_URL or NEXT_PUBLIC_APP_URL is required (use the public server URL, not localhost)"
    exit 1
  fi
fi

: "${REDIS_PASSWORD:?REDIS_PASSWORD is required for Redis health PING}"

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

compose() {
  local args=()
  if [[ -f .env ]]; then
    args+=(--env-file .env)
  fi
  if [[ -f "$ENV_FILE" ]]; then
    args+=(--env-file "$ENV_FILE")
  fi
  docker compose "${args[@]}" -f "$COMPOSE_FILE" "$@"
}

http_ok() {
  local url="$1"
  local body
  body="$(curl -fsS --max-time 10 "$url" 2>/dev/null || true)"
  [[ -n "$body" ]] && echo "$body" | grep -q '"ok":true'
}

echo "==> Health gate against ${HEALTH_BASE_URL} (orchestrator=${ORCH})"

if [[ "$ORCH" == "compose" ]]; then
  if compose ps --help 2>/dev/null | grep -q -- '--format'; then
    echo "Compose service status:"
    compose ps || true
  fi
else
  kubectl -n "$K8S_NAMESPACE" get pods -l 'app in (itu-web,itu-socket,itu-redis)' || true
fi

alive=0
for i in $(seq 1 "$RETRIES"); do
  if http_ok "${HEALTH_BASE_URL}/api/health"; then
    echo "OK  /api/health (attempt ${i})"
    alive=1
    break
  fi
  echo "WAIT /api/health (attempt ${i}/${RETRIES})"
  sleep "$SLEEP_SECS"
done
if [[ "$alive" -ne 1 ]]; then
  echo "ERROR: /api/health failed after ${RETRIES} attempts"
  echo "---- last /api/health response ----"
  curl -sS --max-time 10 "${HEALTH_BASE_URL}/api/health" || true
  echo
  if [[ "$ORCH" == "k8s" ]]; then
    kubectl -n "$K8S_NAMESPACE" logs -l app=itu-web --tail=100 || true
  else
    compose logs --tail=100 web || true
  fi
  exit 1
fi

ready=0
for i in $(seq 1 "$RETRIES"); do
  if http_ok "${HEALTH_BASE_URL}/api/health/ready"; then
    echo "OK  /api/health/ready (attempt ${i}) — Redis + database path"
    ready=1
    break
  fi
  echo "WAIT /api/health/ready (attempt ${i}/${RETRIES})"
  if [[ $((i % 4)) -eq 0 ]]; then
    echo "---- /api/health/ready body (attempt ${i}) ----"
    curl -sS --max-time 10 "${HEALTH_BASE_URL}/api/health/ready" || true
    echo
  fi
  sleep "$SLEEP_SECS"
done
if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: /api/health/ready failed after ${RETRIES} attempts"
  echo "---- last /api/health/ready response ----"
  curl -sS --max-time 10 "${HEALTH_BASE_URL}/api/health/ready" || true
  echo
  if [[ "$ORCH" == "k8s" ]]; then
    kubectl -n "$K8S_NAMESPACE" logs -l app=itu-web --tail=100 || true
  else
    compose logs --tail=100 web || true
  fi
  exit 1
fi

echo "==> Redis PING"
if [[ "$ORCH" == "k8s" ]]; then
  if ! kubectl -n "$K8S_NAMESPACE" exec itu-redis-0 -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' | grep -q PONG; then
    echo "ERROR: Redis PING failed (K8s itu-redis-0)"
    exit 1
  fi
else
  if ! compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' | grep -q PONG; then
    echo "ERROR: Redis PING failed (Compose redis)"
    exit 1
  fi
fi
echo "OK  Redis PING"

echo "==> Database reachability"
DB="$(docker ps --format '{{.Names}}' | grep -E 'supabase_db|supabase-db|supabase.*db' | head -1 || true)"
if [[ -z "$DB" ]]; then
  DB="$(docker ps --format '{{.Names}}' | grep -i postgres | head -1 || true)"
fi
if [[ -z "$DB" ]]; then
  echo "ERROR: No Supabase/Postgres container found"
  exit 1
fi
if ! docker exec "$DB" psql -U postgres -d postgres -tAc 'SELECT 1' | grep -q 1; then
  echo "ERROR: Postgres SELECT 1 failed (container=${DB})"
  exit 1
fi
echo "OK  Database (${DB})"

echo "==> Health gate PASSED"
