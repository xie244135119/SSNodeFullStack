#!/usr/bin/env bash
# 安装 systemd 服务:生成 unit → daemon-reload → enable → restart(新代码生效)。
# 由顶层 install.sh/versionswitch.sh 派发(APP_ROOT 已 baked/导出,config.sh 锁定不弹菜单)。
# 前提:current 已就绪 —— current 是软链 → releases/<ver>-<ts>(install.sh IS_SYMLINK=1 + go_live ln -sfn),
# unit 的 WorkingDirectory=current 跟着软链走;每次部署重生成 unit + restart,新 release 生效。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

say() { printf '\033[36m▶\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
err() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

# 字节数 → 人类可读
human_size() {
  local b="${1:-0}"
  [[ "$b" =~ ^[0-9]+$ ]] || { printf '%s' "$b"; return; }
  if   (( b >= 1073741824 )); then awk -v n="$b" 'BEGIN{printf "%.1fG", n/1073741824}'
  elif (( b >= 1048576 ));    then awk -v n="$b" 'BEGIN{printf "%.1fM", n/1048576}'
  elif (( b >= 1024 ));       then awk -v n="$b" 'BEGIN{printf "%.1fK", n/1024}'
  else printf '%sB' "$b"; fi
}

say "安装 systemd 服务: $SERVICE"
echo "  工作目录: $CURRENT_DIR"

[[ -d "$CURRENT_DIR" ]] || { err "current 目录不存在: $CURRENT_DIR (APP_ROOT=$APP_ROOT;先跑 deploy 把版本放到 current/,或重选 APP_ROOT)"; exit 1; }
[[ -x "$NODE_BIN" ]] || { err "node 不存在或不可执行: $NODE_BIN (改 config.sh 的 NODE_BIN)"; exit 1; }
[[ -f "$CURRENT_DIR/dist/main.js" ]] || { err "$CURRENT_DIR/dist/main.js 不存在 (APP_ROOT 选错或 release 未推到位;若在 current/ 子目录里执行,改到 APP_ROOT 重试)"; exit 1; }

$SUDO mkdir -p "$LOG_DIR"

# unit 字段全走 current 软链 / APP_ROOT / 持久化 config.sh,跨版本逐字节不变。
UNIT_PATH="/etc/systemd/system/$SERVICE.service"
NEW_UNIT="$(cat <<EOF
[Unit]
Description=$SERVICE
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=$ENV
Environment=DB_DIR=$APP_ROOT/data
ExecStart=$NODE_BIN $CURRENT_DIR/dist/main.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_DIR/$SERVICE.log
StandardError=append:$LOG_DIR/$SERVICE.log

[Install]
WantedBy=multi-user.target
EOF
)"

# 幂等:仅当内容变化才写 unit + daemon-reload。回滚/重部署时 unit 通常不变,
# 跳过冗余写入,真正让新代码生效的只是 restart(systemd 按 WorkingDirectory=current 重新解析软链)。
if [[ -f "$UNIT_PATH" ]] && [[ "$NEW_UNIT" == "$($SUDO cat "$UNIT_PATH" 2>/dev/null || true)" ]]; then
  echo "  unit 无变化,跳过写入"
else
  printf '%s\n' "$NEW_UNIT" | $SUDO tee "$UNIT_PATH" >/dev/null
  $SUDO systemctl daemon-reload
  ok "已写入 unit: $UNIT_PATH"
fi

$SUDO systemctl enable "$SERVICE" >/dev/null
# restart:首次=start;二次部署/回滚轮转 current 后重启使新代码生效
$SUDO systemctl restart "$SERVICE"
sleep 1

# 紧凑状态摘要(替代冗长的英文 systemctl status 全文)
cur_active="$($SUDO systemctl is-active "$SERVICE" 2>/dev/null || true)"
cur_pid="$($SUDO systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || true)"
cur_mem="$($SUDO systemctl show -p MemoryCurrent --value "$SERVICE" 2>/dev/null || true)"
if [[ "$cur_active" == "active" && -n "$cur_pid" && "$cur_pid" != "0" ]]; then
  ok "服务运行中  PID $cur_pid  内存 $(human_size "$cur_mem")"
else
  err "服务未运行(active=${cur_active:-未知}),查日志: ./logs.sh"
fi
echo "  日志: ./logs.sh"
