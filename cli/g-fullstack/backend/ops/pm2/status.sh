#!/usr/bin/env bash
# 查看 pm2 应用状态。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ pm2 进程列表:"
$PM2_BIN ps 2>/dev/null || $PM2_BIN list
echo
echo "▶ $APP_NAME 详情:"
$PM2_BIN describe "$APP_NAME" 2>/dev/null | head -n 30 || echo "(应用不存在,先 ./install.sh)"
echo
echo "▶ current 目录:"
ls -ld "$CURRENT_DIR" 2>/dev/null || echo "(current 不存在)"
