#!/usr/bin/env bash
# 停止 pm2 应用(进程保留条目,可再 start)。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 停止 $APP_NAME..."
$PM2_BIN stop "$APP_NAME" || echo "(未在运行或已停)"
printf '\033[32m✓\033[0m 已停止\n'
