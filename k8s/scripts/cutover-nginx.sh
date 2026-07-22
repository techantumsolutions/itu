#!/usr/bin/env bash
# Point host ports 4009 (web) and 3001 (socket) at K3s ClusterIP Services via baota nginx.
set -euo pipefail
NS="${NS:-itu}"
CONF="${CONF:-/www/server/panel/vhost/nginx/itu-k3s-edge.conf}"
NGINX_BIN="${NGINX_BIN:-/www/server/nginx/sbin/nginx}"
WEB_IP="$(kubectl -n "$NS" get svc itu-web -o jsonpath='{.spec.clusterIP}')"
SOCK_IP="$(kubectl -n "$NS" get svc itu-socket -o jsonpath='{.spec.clusterIP}')"
[[ -n "$WEB_IP" && -n "$SOCK_IP" ]] || { echo "ERROR: missing ClusterIPs"; exit 1; }

cat >"$CONF" <<EOF
# Managed by ITU K3s cutover — proxy host edge ports to ClusterIP Services.
server {
    listen 4009;
    listen [::]:4009;
    server_name _;
    location / {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass http://$WEB_IP:3000;
    }
}
server {
    listen 3001;
    listen [::]:3001;
    server_name _;
    location / {
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_pass http://$SOCK_IP:3001;
    }
}
EOF

echo "Wrote $CONF (web=$WEB_IP:3000 socket=$SOCK_IP:3001)"
"$NGINX_BIN" -t
"$NGINX_BIN" -s reload
sleep 1
curl -fsS -m 5 http://127.0.0.1:4009/api/health | head -c 200; echo
curl -fsS -m 5 http://127.0.0.1:3001/health | head -c 200; echo
echo "OK: nginx reloaded"
