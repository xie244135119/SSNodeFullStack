#!/usr/bin/env bash
###
 # Description  backend 启动薄封装 —— 按 baked MODE 派发到 ops/<mode>/start.sh
###
# 由 install.sh 首次部署时拷到 APP_ROOT 根并 baked APP_ROOT/MODE 字面量。
# 直接在 APP_ROOT 下跑: ./start.sh
set -euo pipefail
APP_ROOT="${APP_ROOT:-}"   # baked
MODE="${MODE:-}"            # baked
[[ -n "$APP_ROOT" && -n "$MODE" ]] || { echo "✗ 后台服务目录/MODE 未 baked(先跑 install.sh 完成首次部署)" >&2; exit 1; }
export APP_ROOT MODE
exec bash "$APP_ROOT/ops/$MODE/start.sh"
