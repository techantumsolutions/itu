#!/usr/bin/env bash
# Point host ports 4009 (web) and 3001 (socket) at K3s ClusterIP Services via baota nginx.
#
# Critical: HTML/RSC must NOT be cached across deploys. Next standalone serves
# prerendered pages with Cache-Control: s-maxage=31536000 which points browsers
# at hashed /_next/static/chunks/*.js. After a new image deploy those hashes
# change → first paint may work from memory, then a lazy chunk 404s ("couldn't
# load"); hard reload fetches fresh HTML and works.
set -euo pipefail
NS="${NS:-itu}"
CONF="${CONF:-/www/server/panel/vhost/nginx/itu-k3s-edge.conf}"
NGINX_BIN="${NGINX_BIN:-/www/server/nginx/sbin/nginx}"
WEB_IP="$(kubectl -n "$NS" get svc itu-web -o jsonpath='{.spec.clusterIP}')"
SOCK_IP="$(kubectl -n "$NS" get svc itu-socket -o jsonpath='{.spec.clusterIP}')"
[[ -n "$WEB_IP" && -n "$SOCK_IP" ]] || { echo "ERROR: missing ClusterIPs"; exit 1; }

cat >"$CONF" <<EOF
# Managed by ITU K3s cutover — proxy host edge ports to ClusterIP Services.
upstream itu_web_k3s {
    server $WEB_IP:3000;
    keepalive 16;
}
upstream itu_socket_k3s {
    server $SOCK_IP:3001;
    keepalive 8;
}

server {
    listen 4009;
    listen [::]:4009;
    server_name _;

    # Hashed assets — safe to cache forever (filename changes every build).
    location /_next/static/ {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_pass http://itu_web_k3s;
        # Prefer upstream immutable headers; ensure long cache if missing.
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # Everything else (HTML, RSC flight, API) — never cache at the edge.
    # Strips Next's s-maxage=31536000 on prerendered HTML/RSC that causes
    # post-deploy chunk 404s when stale documents reference dead hashes.
    location / {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_pass http://itu_web_k3s;
        proxy_hide_header Cache-Control;
        proxy_hide_header Expires;
        add_header Cache-Control "private, no-cache, no-store, max-age=0, must-revalidate" always;
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
        proxy_pass http://itu_socket_k3s;
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
