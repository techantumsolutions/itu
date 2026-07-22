#!/usr/bin/env bash
# Validate ITU K3s stack in namespace itu.
set -euo pipefail
NS="${NS:-itu}"
pass=0; fail=0
check() {
  local name="$1"; shift
  if "$@"; then echo "PASS  $name"; pass=$((pass+1)); else echo "FAIL  $name"; fail=$((fail+1)); fi
}

echo "=== ITU validation (ns=$NS) ==="
check "namespace exists" kubectl get ns "$NS"
check "redis sts ready" kubectl -n "$NS" get pod itu-redis-0 -o jsonpath='{.status.phase}' | grep -qx Running
check "redis ping" kubectl -n "$NS" exec itu-redis-0 -- sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' | grep -qx PONG
check "web deploy available" kubectl -n "$NS" get deploy itu-web -o jsonpath='{.status.availableReplicas}' | grep -Eq '^[1-9]'
check "socket deploy available" kubectl -n "$NS" get deploy itu-socket -o jsonpath='{.status.availableReplicas}' | grep -Eq '^[1-9]'
check "worker deploy available" kubectl -n "$NS" get deploy itu-worker -o jsonpath='{.status.availableReplicas}' | grep -Eq '^[1-9]'
check "scaledobject ready" kubectl -n "$NS" get scaledobject itu-worker-scaler -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep -qx True
check "hpa exists" kubectl -n "$NS" get hpa -l scaledobject.keda.sh/name=itu-worker-scaler

WEB_IP="$(kubectl -n "$NS" get svc itu-web -o jsonpath='{.spec.clusterIP}')"
SOCK_IP="$(kubectl -n "$NS" get svc itu-socket -o jsonpath='{.spec.clusterIP}')"
check "web /api/health via ClusterIP" curl -fsS -m 5 "http://$WEB_IP:3000/api/health" | grep -q '"ok":true'
check "web /api/health/ready via ClusterIP" curl -fsS -m 10 "http://$WEB_IP:3000/api/health/ready" | grep -q '"ok":true'
check "socket /health via ClusterIP" curl -fsS -m 5 "http://$SOCK_IP:3001/health" | grep -q '"ok":true'

echo "=== Result: $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
