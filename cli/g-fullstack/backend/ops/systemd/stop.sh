#!/usr/bin/env bash
# 停止 systemd 服务。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 停止 $SERVICE..."
$SUDO systemctl stop "$SERVICE"
printf '\033[32m✓\033[0m 已停止\n'
