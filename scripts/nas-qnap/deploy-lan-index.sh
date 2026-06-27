#!/usr/bin/env bash
# 内网 /index/ 闭环：HTTP :88、HTTPS :44（自签）、HTTP 误连 :44 → :88
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LAN_IP="${NAS_LAN_IP:-192.168.0.6}"
NAS_HOST="${NAS_HOST:-nas-qnap}"
REMOTE_TMP="/tmp/npm-lan-index-$$"
DOCKER="/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"
NPM="${NPM_CONTAINER:-nginx-proxy-manager}"
CERT_DIR="/data/custom_ssl/lan-ip"
PUBLIC_HOST="${NAS_PUBLIC_HOST:-houjia.mycloudnas.com}"

ssh -o BatchMode=yes "$NAS_HOST" "mkdir -p '$REMOTE_TMP'"
scp -q "$ROOT/http-lan-index.conf.snippet" "$ROOT/http-lan-index-https.conf.snippet" \
  "$ROOT/welcome-index.html" \
  "$NAS_HOST:$REMOTE_TMP/"

ssh -o BatchMode=yes "$NAS_HOST" bash -s <<EOF
set -euo pipefail
D=$DOCKER
N=$NPM
LAN=$LAN_IP
CERT=$CERT_DIR
TMP=$REMOTE_TMP
PH=$PUBLIC_HOST

\$D cp "\$TMP/welcome-index.html" "\$N:/tmp/welcome-index.html"
\$D exec "\$N" sh -c "mkdir -p /data/nginx/custom/welcome && sed -e 's/{{LAN_IP}}/'\"\$LAN\"'/g' -e 's/{{PUBLIC_HOST}}/'\"\$PH\"'/g' /tmp/welcome-index.html > /data/nginx/custom/welcome/index.html"

\$D cp "\$TMP/http-lan-index.conf.snippet" "\$N:/tmp/http-lan-index.conf.snippet"
\$D cp "\$TMP/http-lan-index-https.conf.snippet" "\$N:/tmp/http-lan-index-https.conf.snippet"

\$D exec "\$N" sh -c "mkdir -p \$CERT"
\$D exec "\$N" sh -c "test -f \$CERT/fullchain.pem || openssl req -x509 -nodes -days 825 -newkey rsa:2048 -keyout \$CERT/privkey.pem -out \$CERT/fullchain.pem -subj /CN=\$LAN"

\$D exec "\$N" sh -c '
  grep -q index-lan-http /data/nginx/custom/http.conf 2>/dev/null || cat /tmp/http-lan-index.conf.snippet >> /data/nginx/custom/http.conf
  grep -q index-lan-ip-443 /data/nginx/custom/http.conf 2>/dev/null || cat /tmp/http-lan-index-https.conf.snippet >> /data/nginx/custom/http.conf
  /usr/sbin/nginx -t
  /usr/sbin/nginx -s reload
'
rm -rf "\$TMP"
EOF

echo "==> verify"
curl -sfI "http://${LAN_IP}:88/index/" | head -1
curl -sfIk "https://${LAN_IP}:44/index/" | head -1
c=$(curl -sI -o /dev/null -w '%{http_code}' "http://${LAN_IP}:44/index/")
echo "http://${LAN_IP}:44/index/ -> HTTP ${c}"
test "${c}" = "302" -o "${c}" = "301"
curl -sfIL "http://${LAN_IP}:44/index/" | rg -i "^HTTP|^location" | head -6
echo OK
