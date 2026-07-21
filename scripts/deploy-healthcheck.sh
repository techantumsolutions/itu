#!/usr/bin/env bash
# Post-deploy health gate for production compose stack.
#
# Verifies:
#   1. GET /api/health          (liveness)
#   2. GET /api/health/ready    (Redis + Supabase / database path)
#   3. Redis PING via compose
#   4. Postgres reachable via Supabase DB container
#
# Usage:
#   bash scripts/deploy-healthcheck.sh
#   HEALTH_BASE_URL=http://127.0.0.1:4009 bash scripts/deploy-healthcheck.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${DEPLOY_ENV_FILE:-.deploy/images.env}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://127.0.0.1:4009}"
RETRIES="${HEALTH_RETRIES:-24}"
SLEEP_SECS="${HEALTH_SLEEP_SECS:-5}"

compose() {
  if [[ -f "$ENV_FILE" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

http_ok() {
  local url="$1"
  local body
  body="$(curl -fsS --max-time 10 "$url" 2>/dev/null || true)"
  [[ -n "$body" ]] && echo "$body" | grep -q '"ok":true'
}

echo "==> Health gate against ${HEALTH_BASE_URL}"

# Wait for compose-reported healthy where supported, then probe HTTP.
if compose ps --help 2>/dev/null | grep -q -- '--format'; then
  echo "Compose service status:"
  compose ps || true
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
  sleep "$SLEEP_SECS"
done
if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: /api/health/ready failed after ${RETRIES} attempts"
  exit 1
fi

echo "==> Redis PING"
if ! compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' | grep -q PONG; then
  echo "ERROR: Redis PING failed"
  exit 1
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
