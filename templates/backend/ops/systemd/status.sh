#!/usr/bin/env bash
# 查看 systemd 服务状态。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ $SERVICE 状态:"
$SUDO systemctl --no-pager --full status "$SERVICE" || true
echo
echo "▶ current 目录:"
ls -ld "$CURRENT_DIR" 2>/dev/null || echo "(current 不存在)"
echo
echo "▶ recent log (tail):"
[[ -f "$LOG_DIR/$SERVICE.log" ]] && tail -n 15 "$LOG_DIR/$SERVICE.log" || echo "(日志文件不存在)"
