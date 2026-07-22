#!/usr/bin/env bash
# Enqueue N synthetic BullMQ wait-list entries for KEDA scale tests.
# Uses redis-cli inside itu-redis-0. For load tests only — not production jobs.
set -euo pipefail
NS="${NS:-itu}"
N="${1:-20}"

echo "Pushing $N dummy list entries onto bull:provider-sync:wait"
kubectl -n "$NS" exec itu-redis-0 -- sh -c "
  REDISCLI_AUTH=\"\$REDIS_PASSWORD\"
  export REDISCLI_AUTH
  i=0
  while [ \$i -lt $N ]; do
    redis-cli LPUSH bull:provider-sync:wait \"keda-loadtest-\$i\" >/dev/null
    i=\$((i+1))
  done
  echo -n 'LLEN='
  redis-cli LLEN bull:provider-sync:wait
"

echo "Watch: kubectl -n $NS get deploy itu-worker -w"
echo "HPA:    kubectl -n $NS get hpa -w"
echo "SO:     kubectl -n $NS get scaledobject itu-worker-scaler"
