#!/usr/bin/env bash
# 跟踪 pm2 应用日志。
# 用法: ./logs.sh [-n 行数]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

LINES=200
[[ "${1:-}" == "-n" && -n "${2:-}" ]] && LINES="$2"

echo "▶ pm2 logs $APP_NAME --lines $LINES  (Ctrl-C 退出)"
$PM2_BIN logs "$APP_NAME" --lines "$LINES" --nostream 2>/dev/null || true
echo
echo "▶ 实时跟踪中..."
$PM2_BIN logs "$APP_NAME" --lines "$LINES"
