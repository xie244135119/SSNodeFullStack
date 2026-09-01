#!/usr/bin/env bash
# 停止 docker 容器(进程保留容器,可再 start)。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 停止 $CONTAINER_NAME ..."
docker stop "$CONTAINER_NAME" 2>/dev/null || echo "(未在运行或不存在)"
echo "✓ stopped."
