#!/usr/bin/env bash
# 启动(已存在则 reload 更新 env/cwd)pm2 应用。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 启动 $APP_NAME..."
if $PM2_BIN jlist 2>/dev/null | grep -q "\"name\":\"$APP_NAME\""; then
  # restart(非 reload):本应用 exec_mode=fork,pm2 reload 仅供 cluster 模式、fork 下不可靠;
  # restart 对 running/stopped 均幂等,且重启进程 → 重读 current/config/config.prod.yaml(改配置+./start.sh 轮换)。
  $PM2_BIN restart "$APP_NAME" --update-env
  echo "✓ restarted."
else
  $PM2_BIN start "$APP_NAME" 2>/dev/null || $PM2_BIN start "$APP_ROOT/ecosystem.config.cjs"
  echo "✓ started."
fi
