#!/usr/bin/env bash
# 跟踪 systemd 服务日志(unit 已把 stdout/stderr 重定向到 $LOG_DIR/$SERVICE.log)。
# 用法: ./logs.sh [-n 行数]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

LINES=200
[[ "${1:-}" == "-n" && -n "${2:-}" ]] && LINES="$2"

LOG_FILE="$LOG_DIR/$SERVICE.log"
if [[ -f "$LOG_FILE" ]]; then
  echo "▶ tail -n $LINES -f $LOG_FILE  (Ctrl-C 退出)"
  tail -n "$LINES" -f "$LOG_FILE"
else
  echo "▶ 日志文件不存在($LOG_FILE),回退 journalctl -u $SERVICE -f"
  $SUDO journalctl -u "$SERVICE" -n "$LINES" -f --no-pager
fi
