#!/usr/bin/env bash
# docker 部署共用配置 —— 运维按环境改这一处即可,各脚本都 source 它。
#
# 与 systemd/pm2 的 config.sh 对位。APP_ROOT 由顶层 install.sh / start.sh / stop.sh
# 经环境变量传入(顶层脚本已 baked 字面量);此处只补 docker 专属变量。

# 后端根目录(current/releases/data/logs 所在)—— 顶层脚本导出
APP_ROOT="${APP_ROOT:-}"
[[ -n "$APP_ROOT" ]] || { echo "✗ docker config: APP_ROOT 未导出(应由顶层 start/stop/install.sh 传入)" >&2; exit 1; }

CURRENT_DIR="$APP_ROOT/current"
DATA_DIR="$APP_ROOT/data"
LOG_DIR="$APP_ROOT/logs"
ENV_FILE="$APP_ROOT/.env"

# 镜像名(不含 tag;tag = <version>-<14位ts>,见 read_tag)
IMAGE="${IMAGE:-g-fullstack-backend}"
# 容器名
CONTAINER_NAME="${CONTAINER_NAME:-g-fullstack-backend}"
# 运行端口权威 = .env 的 PORT(docker 模式 env 注入,app 读 PORT 监听;迁移换端口只改 .env)。
# 宿主映射 = 容器内监听 = 此端口(PORT:PORT,nginx 反代到此),与 healthcheck 一致。
# .env 无 PORT 回退 3001(防御,不阻断)。systemd/pm2 模式端口权威在 config.prod.yaml,与此无关。
read_env_port() {
  [[ -f "$ENV_FILE" ]] || { printf '%s' "3001"; return; }
  local p
  p="$(sed -nE 's/^PORT=//p' "$ENV_FILE" | head -1 | sed -E "s/^['\"]?//; s/['\"]?$//; s/^[[:space:]]+//; s/[[:space:]]+$//")"
  printf '%s' "${p:-3001}"
}
PORT="$(read_env_port)"
HOST_PORT="$PORT"
CONTAINER_PORT="$PORT"
# 容器内数据根(固定,随 /app/data mount 目标锁定)
CONTAINER_DATA_DIR="${CONTAINER_DATA_DIR:-/app/data}"
# 重启策略
RESTART_POLICY="${RESTART_POLICY:-unless-stopped}"

# 读 current 的 version + .build-ts 作镜像 tag(<version>-<14位ts>,与 systemd/pm2 releases/<ver>-<ts> 同口径)。
# .build-ts 由 buildops 写入;缺则回退纯 version(兼容旧 release,但同 version 重发会覆盖,留意回滚)。
read_tag() {
  local v ts
  v="$(grep -m1 '"version"' "$CURRENT_DIR/package.json" 2>/dev/null \
    | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  ts="$(cat "$CURRENT_DIR/.build-ts" 2>/dev/null || true)"
  if [[ -n "$v" && -n "$ts" ]]; then printf '%s-%s' "$v" "$ts"
  else printf '%s' "$v"
  fi
}
