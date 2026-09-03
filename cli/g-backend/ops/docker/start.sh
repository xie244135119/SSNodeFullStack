#!/usr/bin/env bash
# 启动 docker 容器(已存在则 start,不存在提示先 install)。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 启动 $CONTAINER_NAME ..."
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker start "$CONTAINER_NAME"
  echo "✓ started."
else
  echo "✗ 容器不存在,先跑 install.sh(或顶层 install.sh/versionswitch.sh 派发)"
  exit 1
fi
