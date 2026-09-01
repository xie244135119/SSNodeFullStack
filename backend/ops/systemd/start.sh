#!/usr/bin/env bash
# 启动 systemd 服务。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 启动 $SERVICE..."
# restart(非 start):服务在跑时 systemctl start 是 no-op、不重载配置;restart 始终重启
# 进程 → 重读 current/config/config.prod.yaml,适用于「服务器改 yaml 后直接 ./start.sh 轮换」。
$SUDO systemctl restart "$SERVICE"
$SUDO systemctl --no-pager --full status "$SERVICE" | head -n 12 || true
echo "✓ restarted. 状态: ./status.sh | 日志: ./logs.sh"
