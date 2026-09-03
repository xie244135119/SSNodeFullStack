#!/usr/bin/env bash
# 查看 docker 容器状态 + current 目录。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ $CONTAINER_NAME 容器状态:"
docker ps -a --filter "name=^/$CONTAINER_NAME\$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}' || true
echo
echo "▶ current 目录:"
ls -ld "$CURRENT_DIR" 2>/dev/null || echo "(current 不存在)"
echo
echo "▶ data 目录:"
ls -ld "$DATA_DIR" 2>/dev/null || echo "(data 不存在)"
