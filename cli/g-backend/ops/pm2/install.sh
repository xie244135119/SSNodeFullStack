#!/usr/bin/env bash
# 安装 pm2 应用:生成 ecosystem → delete+start(幂等)→ pm2 save(开机自启另跑 pm2 startup)。
# 前提:current 目录已就绪 —— current 是软链 → releases/<ver>-<ts>(install.sh IS_SYMLINK=1 + go_live ln -sfn),
# ecosystem 的 cwd=current 跟着软链走;每次部署重生成 ecosystem + delete+start 重应用,新 release 生效。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

echo "▶ 安装 pm2 应用: $APP_NAME"
echo "  APP_ROOT=$APP_ROOT  CURRENT_DIR=$CURRENT_DIR"

[[ -d "$CURRENT_DIR" ]] || { echo "✗ current 目录不存在: $CURRENT_DIR (APP_ROOT=$APP_ROOT;先跑 deploy 把版本放到 current/,或重选 APP_ROOT)"; exit 1; }
command -v "$PM2_BIN" >/dev/null 2>&1 || { echo "✗ pm2 不存在: $PM2_BIN (装 npm i -g pm2 或改 config.sh 的 PM2_BIN)"; exit 1; }
[[ -f "$CURRENT_DIR/dist/main.js" ]] || { echo "✗ $CURRENT_DIR/dist/main.js 不存在 (APP_ROOT 选错或 release 未推到位;若在 current/ 子目录里执行,改到 APP_ROOT 重试)"; exit 1; }

mkdir -p "$LOG_DIR"

# JS 安全双引号转义(任意值合法):先转 \ 再转 "。替代 bash4.4+ 的 ${var@Q},
# 兼容服务器 bash 4.2(CentOS/RHEL 7)。生成的字符串直接进 ecosystem.config.cjs。
q() { local v="$1"; v="${v//\\/\\\\}"; v="${v//\"/\\\"}"; printf '"%s"' "$v"; }

# 生成 ecosystem(pm2 读 cwd=current,配置走 release 自带 config.yaml;env 注入
# NODE_ENV 选 yaml + DB_DIR 指向跨版本共享 data 目录 = APP_ROOT/data)
ECO_PATH="$APP_ROOT/ecosystem.config.cjs"
echo "  写入 ecosystem → $ECO_PATH"
cat > "$ECO_PATH" <<EOF
module.exports = {
  apps: [{
    name: $(q "$APP_NAME"),
    script: 'dist/main.js',
    cwd: $(q "$CURRENT_DIR"),
    instances: $INSTANCES,
    exec_mode: 'fork',
    out_file: $(q "$LOG_DIR/$APP_NAME.log"),
    error_file: $(q "$LOG_DIR/$APP_NAME.log"),
    merge_logs: true,
    env: { NODE_ENV: $(q "$ENV"), DB_DIR: $(q "$DATA_DIR") }
  }]
};
EOF

# 幂等重应用 ecosystem:delete 清旧条目(进程+元数据,不存在则忽略)→ start 全新读 ecosystem。
# 不用 startOrReload:deploy 前已 stop(条目 stopped),startOrReload 走 reload 分支,
# 而 reload 对 stopped 进程报 "Process not found" 并留 stopped。单实例 SQLite 无零停需求,delete 的停顿可接受。
$PM2_BIN delete "$APP_NAME" >/dev/null 2>&1 || true
$PM2_BIN start "$ECO_PATH"
$PM2_BIN save
echo "✓ 已安装并 save。"
echo "  开机自启(首次): $PM2_BIN startup  (按提示拷执行它给的命令)"
echo "  启动/状态/日志: ./start.sh | ./status.sh | ./logs.sh"
