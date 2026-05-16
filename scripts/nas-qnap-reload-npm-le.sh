#!/usr/bin/env bash
# QNAP 续订 LE 后同步到 NPM 并 reload（在 NAS 上执行，或 SSH：bash /share/Public/npm-qnap-reload-npm-le.sh）
set -euo pipefail

DOCKER="${DOCKER:-/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker}"
CONTAINER="${NPM_CONTAINER:-nginx-proxy-manager}"
CERT_ID="${NPM_CERT_ID:-1}"

if ! "$DOCKER" ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
	echo "容器 $CONTAINER 未运行" >&2
	exit 1
fi

"$DOCKER" exec "$CONTAINER" sh -ec "
set -e
dir=/data/custom_ssl/npm-${CERT_ID}
mkdir -p \"\$dir\"
cat /etc/qnap-le/backup.cert /etc/qnap-le/uca.pem > \"\$dir/fullchain.pem\"
cp /etc/qnap-le/backup.key \"\$dir/privkey.pem\"
chmod 600 \"\$dir/privkey.pem\"
openssl x509 -in \"\$dir/fullchain.pem\" -noout -subject -dates
nginx -s reload
"
echo "NPM 证书已自 /etc/qnap-le 同步并 reload 完成（cert npm-${CERT_ID}）"
