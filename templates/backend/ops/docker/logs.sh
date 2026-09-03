#!/usr/bin/env bash
# 跟踪 docker 容器日志。
# 用法: ./logs.sh [-n 行数]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

LINES=200
[[ "${1:-}" == "-n" && -n "${2:-}" ]] && LINES="$2"

echo "▶ docker logs -n $LINES -f $CONTAINER_NAME  (Ctrl-C 退出)"
docker logs -n "$LINES" -f "$CONTAINER_NAME"
