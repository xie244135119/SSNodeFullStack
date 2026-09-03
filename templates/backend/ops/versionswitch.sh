#!/usr/bin/env bash
###
 # Description  backend 版本切换薄封装 —— 按模式切换激活版本(可升可降,不限于回滚)
###
# 由 install.sh 首次部署时拷到 APP_ROOT 根并 baked APP_ROOT/MODE 字面量。
# 直接在 APP_ROOT 下跑: ./versionswitch.sh [序号或版本片段]
#
# systemd/pm2(current=软链):列 releases 备份,选一个 → 原子改链 current → 刷新 config →
#   派发 mode install 重启。旧 release 保留在 releases(可再切换)。data/logs 不动。
# docker(current=真实目录):列镜像 tag,选一个 → 停删容器 → 用目标 tag 重 run(env 同 .env)。
set -euo pipefail
APP_ROOT="${APP_ROOT:-}"
MODE="${MODE:-}"
[[ -n "$APP_ROOT" ]] || { echo "✗ 后台服务目录未 baked" >&2; exit 1; }
[[ -n "$MODE" ]] || MODE="$(cat "$APP_ROOT/.mode" 2>/dev/null || true)"
[[ -n "$MODE" ]] || { echo "✗ 缺 MODE" >&2; exit 1; }

say() { printf '\033[36m▶\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
err() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

# 便携 sed 原地改(GNU/BSD 均兼容)
_sed_i() { local f="$1"; shift; sed "$@" "$f" > "$f.__sed_i" && mv "$f.__sed_i" "$f"; }

# 按 release 目录名末段(最后一个 - 之后)的 14 位时间戳降序列出 releases/(与 install.sh 同口径)。
sort_releases() {
  local rel="$1" d base ts
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    base="$(basename "$d")"
    ts="${base##*-}"
    [[ "$ts" =~ ^[0-9]{14}$ ]] || ts="00000000000000"
    printf '%s\t%s\n' "$ts" "$d"
  done < <(ls -1d "$rel"/* 2>/dev/null || true) | sort -r -k1,1 | cut -f2-
}

# 后台服务访问地址:端口以 config.prod.yaml app.port 为权威(yaml 即运行端口)。
#   systemd/pm2:current 软链 → 运行中 release 的 config/config.prod.yaml;
#   docker:运行中容器所用镜像 → image_yaml_port(docker run --entrypoint cat 读其 /app/config)。
# 前缀固定 /api。外网访问用服务器 IP 替换 localhost。
service_addr() {
  local port=""
  if [[ "$MODE" == "docker" ]]; then
    # 优先取运行容器注入的 PORT env(选项 2/3 覆盖时 app 实际监听此端口);否则取镜像内 yaml
    port="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_NAME" 2>/dev/null \
      | sed -nE 's/^PORT=//p' | head -1 || true)"
    if [[ -z "$port" ]]; then
      local img; img="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"
      [[ -n "$img" ]] && port="$(image_yaml_port "$img")"
    fi
  else
    local cfg="$APP_ROOT/current/config/config.prod.yaml"
    [[ -f "$cfg" ]] && port="$(sed -nE 's/^[[:space:]]*port:[[:space:]]*//p' "$cfg" | head -1 | sed -E "s/^['\"]?//; s/['\"]?$//")"
  fi
  printf 'http://localhost:%s/api' "${port:-?}"
}

# 读 yaml app.port(去引号/首尾空白)。无文件/无 port 行 → 空串。
yaml_port() {
  local f="$1" p
  [[ -f "$f" ]] || { printf ''; return 1; }
  p="$(sed -nE 's/^[[:space:]]*port:[[:space:]]*//p' "$f" | head -1 | sed -E "s/^['\"]?//; s/['\"]?$//; s/^[[:space:]]+//; s/[[:space:]]+$//")"
  printf '%s' "$p"
}

# 读 docker 镜像内 /app/config/config.prod.yaml 的 app.port(dump 出来本地解析,复用同款 sed)。
# 镜像缺 config/ 或 docker 异常 → 空串(不阻断切换)。仅 docker 切换端口校验用。
image_yaml_port() {
  local img="$1" text
  command -v docker >/dev/null 2>&1 || { printf ''; return 1; }
  text="$(docker run --rm --entrypoint cat "$img" /app/config/config.prod.yaml 2>/dev/null || true)"
  [[ -n "$text" ]] || { printf ''; return 1; }
  printf '%s\n' "$text" | sed -nE 's/^[[:space:]]*port:[[:space:]]*//p' | head -1 \
    | sed -E "s/^['\"]?//; s/['\"]?$//; s/^[[:space:]]+//; s/[[:space:]]+$//"
}

# 规范化绝对路径(软链穿透;cd 失败返回空)。用于判断 current 是否指向同一 release。
real_dir() { (cd "$1" 2>/dev/null && pwd -P) || true; }

# 切换端口选择(仅当目标 != 当前运行版本时调用):端口以 config.prod.yaml 为权威(yaml 即
# 运行端口),切换到不同端口版本 = 运行端口将真实变更,nginx 若指向旧端口会不通。三选一:
#   1) 用目标端口(不改动,nginx 需指向目标端口)
#   2) 用当前运行端口(推荐,nginx 无需改动 —— 把目标 config app.port 改成当前端口)
#   3) 输入新端口(把目标 config app.port 改成新端口,nginx 需指向新端口)
# 结果写全局:
#   CHOSEN_PORT    = 最终运行端口(供后续 -p/healthcheck/service_addr 用)
#   CHOSEN_PORT_EDIT=1 表示需要把目标 config.prod.yaml 的 app.port 改成 CHOSEN_PORT(选项 2/3)
# 任一端口读不到 → 跳过(不阻断)。取消 → die(未切链/未重建容器)。
choose_switch_port() {
  local cur_port="$1" tgt_port="$2" ans np
  CHOSEN_PORT=""; CHOSEN_PORT_EDIT=0
  if [[ -z "$cur_port" || -z "$tgt_port" ]]; then
    say "端口校验跳过(无法读取某方 yaml app.port,不阻断)"
    return 0
  fi
  [[ "$cur_port" != "$tgt_port" ]] || return 0
  echo
  say "⚠ 端口不一致:当前运行端口 app.port=$cur_port,切换目标 app.port=$tgt_port"
  echo "  (端口以 config.prod.yaml 为权威;nginx 反代 localhost:<app.port>)"
  echo "  1) 使用切换版本的端口 $tgt_port(切换后 nginx 需指向 $tgt_port)"
  echo "  2) 使用运行版本的端口 $cur_port(推荐,nginx 无需改动)"
  echo "  3) 重新输入新的端口"
  read -rp "  选择 [2]: " ans || ans=""
  ans="${ans:-2}"
  case "$ans" in
    1) CHOSEN_PORT="$tgt_port"; CHOSEN_PORT_EDIT=0 ;;
    2) CHOSEN_PORT="$cur_port"; CHOSEN_PORT_EDIT=1 ;;
    3) read -rp "  输入新端口: " np || np=""
       [[ "$np" =~ ^[0-9]{2,5}$ ]] || die "端口非法: ${np:-空}(未切链/未重建容器)"
       CHOSEN_PORT="$np"; CHOSEN_PORT_EDIT=1 ;;
    *) die "已取消切换(未切链/未重建容器)" ;;
  esac
}

# 把 release 自带 config.prod.yaml 的 app.port 改为指定值(yaml 为权威;systemd/pm2 切换后
# current→该 release,app 直读此 yaml 监听 CHOSEN_PORT,nginx 指向 CHOSEN_PORT 即通)。
# 仅改首个 port: 行(config.prod.yaml 全文仅 app 下唯一一处 port:,同口径取 head -1)。
set_yaml_port() {
  local cfg="$1" port="$2"
  [[ -f "$cfg" ]] || { err "缺 $cfg,无法改端口"; return 1; }
  # 只改首个匹配行(避免误伤未来可能新增的其它 port: 字段)
  local n; n="$(grep -cE '^[[:space:]]*port:[[:space:]]*' "$cfg" || true)"
  [[ "$n" -ge 1 ]] || { err "$cfg 无 app.port 行,无法改端口"; return 1; }
  # 只改首个 port: 行的值(config.prod.yaml 全文仅 app 下唯一一处 port:,同口径取 head -1)
  awk -v p="$port" '
    /^[[:space:]]*port:[[:space:]]*/ && !done { sub(/:[[:space:]]*.*/, ": " p); done=1 }
    { print }
  ' "$cfg" > "$cfg.__port" && mv "$cfg.__port" "$cfg"
  ok "已更新 $cfg 的 app.port=$port"
}

# 内联选号:从数组 items + 用户输入(序号或片段)算 idx(不用 nameref,兼容旧 bash)
#   用法: pick_idx <数组名> <用户输入>;结果写全局 PICK_IDX
pick_idx() {
  local arr="$1" sel="$2" n i
  eval "n=\${#$arr[@]}"
  PICK_IDX=-1
  if [[ "$sel" =~ ^[0-9]+$ ]]; then
    PICK_IDX=$((sel-1))
  else
    for ((i=0; i<n; i++)); do
      eval "[[ \"\${$arr[$i]}\" == *\"\$sel\"* ]]" && { PICK_IDX=$i; break; }
    done
    [[ $PICK_IDX -ge 0 ]] || die "无项含片段: $sel"
  fi
  [[ $PICK_IDX -ge 0 && $PICK_IDX -lt $n ]] || die "选择越界: $((PICK_IDX+1))"
}

# ════════════════════════════════════════════════════════════════
#  systemd / pm2 —— 改软链
# ════════════════════════════════════════════════════════════════
switch_symlink() {
  local RELEASES="$APP_ROOT/releases"
  local items=() broken=() d base

  # 共享 ops 必须存在(releases 不放 ops);无则任何版本都无法派发
  [[ -f "$APP_ROOT/ops/$MODE/install.sh" ]] \
    || die "缺 $APP_ROOT/ops/$MODE/install.sh(共享 ops 未就位;先跑一次 install.sh 部署)"

  # 按 14 位 ts 降序列出;完整性校验:须含 dist/main.js(ops 在 APP_ROOT/ops 共享,不检 release)
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    base="$(basename "$d")"
    if [[ -f "$d/dist/main.js" ]]; then
      items+=("$base")
    else
      broken+=("$base")
    fi
  done < <(sort_releases "$RELEASES")

  [[ ${#items[@]} -gt 0 ]] \
    || die "releases 无完整版本可切换${broken:+(另有 ${#broken[@]} 个残缺目录缺 dist/main.js,已跳过)}"

  echo "可切换版本(releases,最新在前):"
  local i
  for i in "${!items[@]}"; do printf "  %d) %s\n" "$((i+1))" "${items[$i]}"; done
  if [[ ${#broken[@]} -gt 0 ]]; then
    echo "  ⚠️ 残缺(缺 dist/main.js,已跳过,建议清理):"
    for base in "${broken[@]}"; do echo "       $RELEASES/$base"; done
  fi

  local SEL="${1:-}"
  if [[ -z "$SEL" ]]; then read -rp "选择 [1]: " SEL || SEL=""; SEL="${SEL:-1}"; fi
  pick_idx items "$SEL"
  local target="$RELEASES/${items[$PICK_IDX]}"
  echo
  say "切换到: ${items[$PICK_IDX]}"

  # 切换端口选择:仅当目标 != 当前运行版本时,比对两者各自 release yaml 的 app.port。
  # current 是软链 → real_dir 穿透到运行中的 release 目录,读其 config/config.prod.yaml。
  local cur_dir; cur_dir="$(real_dir "$APP_ROOT/current")"
  local tgt_dir; tgt_dir="$(real_dir "$target")"
  if [[ -n "$cur_dir" && -n "$tgt_dir" && "$cur_dir" != "$tgt_dir" ]]; then
    choose_switch_port \
      "$(yaml_port "$cur_dir/config/config.prod.yaml")" \
      "$(yaml_port "$tgt_dir/config/config.prod.yaml")"
    # 选项 2/3:把目标 release 自带 config.prod.yaml 的端口改为运行/新端口(yaml 为权威;
    # 切换后 current→tgt_dir,app 直读此 yaml 监听 CHOSEN_PORT,nginx 指向 CHOSEN_PORT 不变即通)。
    if [[ "${CHOSEN_PORT_EDIT:-0}" == "1" ]]; then
      set_yaml_port "$tgt_dir/config/config.prod.yaml" "$CHOSEN_PORT"
    fi
  else
    say "目标即当前版本,端口校验跳过"
  fi

  # config 随 release:切换即用目标版本自带的 config.yaml(运维在 current/config.yaml
  # 上做的改动属于当时那个版本,不跨版本迁移)。data/ 跨版本共享,不动。

  # 切链前确认目标完整(防竞态:列表后目录被删)
  [[ -f "$target/dist/main.js" ]] \
    || die "目标版本不完整,已中止切换(未切链): $target"

  # systemd/pm2:目标 release 若缺 node_modules(当初部署 npm i 未跑成/被中断留下的半成品),
  # 必须在切链前补装,否则切过去会 MODULE_NOT_FOUND crash-loop;放切链前还可让 npm i 失败时不切链、
  # 不停运行中服务。docker 靠镜像,不在此处理。
  if [[ "$MODE" != "docker" && ! -d "$target/node_modules" ]]; then
    say "目标版本缺 node_modules,补装生产依赖 npm i --omit=dev ..."
    (cd "$target" && npm i --omit=dev --legacy-peer-deps --no-audit --no-fund)
    ok "依赖就绪"
  fi

  # 停旧(best-effort)
  say "停止当前服务..."
  bash "$APP_ROOT/stop.sh" 2>/dev/null || true

  # 原子改链
  ln -sfn "$target" "$APP_ROOT/current"
  ok "已切换版本: ${items[$PICK_IDX]}"

  # 派发 mode install(共享 ops,重建/重启进程)
  export APP_ROOT MODE
  bash "$APP_ROOT/ops/$MODE/install.sh"
  ok "版本切换完成"
  echo "  后台服务: $(service_addr)  (外网用服务器 IP 替换 localhost)"
  echo "  状态: cd $APP_ROOT && ./ops/$MODE/status.sh"
}

# ════════════════════════════════════════════════════════════════
#  docker —— 重 run 目标镜像 tag
# ════════════════════════════════════════════════════════════════
switch_docker() {
  local dcfg="$APP_ROOT/ops/docker/config.sh"
  [[ -f "$dcfg" ]] || die "缺 $dcfg"
  # source docker config(APP_ROOT 由 baked)
  export APP_ROOT
  source "$dcfg"

  command -v docker >/dev/null 2>&1 || die "docker 不存在"
  # 列镜像 tag(倒序,<none> 过滤)
  local tags=()
  while IFS= read -r t; do [[ -n "$t" ]] && tags+=("$t"); done < <(docker images "$IMAGE" --format '{{.Tag}}' 2>/dev/null | grep -v '<none>' | sort -rV || true)
  [[ ${#tags[@]} -gt 0 ]] || die "无镜像 $IMAGE tag 可切换"

  echo "可切换镜像 tag($IMAGE,最新在前):"
  local i
  for i in "${!tags[@]}"; do printf "  %d) %s\n" "$((i+1))" "${tags[$i]}"; done

  local SEL="${1:-}"
  if [[ -z "$SEL" ]]; then read -rp "选择 [1]: " SEL || SEL=""; SEL="${SEL:-1}"; fi
  pick_idx tags "$SEL"
  local tag="${tags[$PICK_IDX]}"
  echo
  say "切换到镜像: $IMAGE:$tag"

  # docker 端口权威 = .env 的 PORT(跨 tag 恒定,env 注入;切镜像不改端口)。
  # 当前运行版本 = 运行中容器所用镜像(docker inspect 取 ref);切换不改 current/,故不读 current/config。
  local cur_img=""
  cur_img="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"

  # env:对齐本次 tag(PORT 在 .env 由运维权威,不覆盖;只对齐 TAG/DATA_DIR/CONTAINER_NAME)
  local env_flag=""
  if [[ -f "$APP_ROOT/.env" ]]; then
    _sed_i "$APP_ROOT/.env" \
      -e "s|^TAG=.*|TAG=$tag|" \
      -e "s|^DATA_DIR=.*|DATA_DIR=$APP_ROOT/data|" \
      -e "s|^CONTAINER_NAME=.*|CONTAINER_NAME=$CONTAINER_NAME|"
    env_flag="--env-file $APP_ROOT/.env"
  else
    err "缺 $APP_ROOT/.env,无法注入密钥"; exit 1
  fi

  # 仅当 .env PORT 与当前运行容器的 PORT 不同时告警(运维改了 .env,切换后端口将变,nginx 需指向新端口)。
  # 端口权威 = .env PORT(app 读 PORT 监听);宿主映射 = 容器监听 = PORT。
  local env_port cur_port
  env_port="$(grep -E '^PORT=' "$APP_ROOT/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')"
  [[ -z "$env_port" ]] && env_port="3001"
  cur_port="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_NAME" 2>/dev/null \
    | sed -nE 's/^PORT=//p' | head -1 || true)"
  [[ -z "$cur_port" ]] && cur_port="$(image_yaml_port "$cur_img" 2>/dev/null || true)"
  if [[ -n "$cur_port" && "$cur_port" != "$env_port" ]]; then
    say "⚠ .env PORT=$env_port 与当前运行端口 $cur_port 不同(切换后端口将变为 $env_port,nginx 需指向 $env_port)"
  fi
  HOST_PORT="$env_port"
  CONTAINER_PORT="$env_port"
  local port_env=( -e PORT="$env_port" )

  say "重建容器 $CONTAINER_NAME(tag $tag)..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart "$RESTART_POLICY" \
    -p "$HOST_PORT:$CONTAINER_PORT" \
    $env_flag \
    "${port_env[@]}" \
    -e NODE_ENV=prod \
    -e DB_DIR="$CONTAINER_DATA_DIR" \
    -e UPLOAD_STORAGE_PATH="$CONTAINER_DATA_DIR/uploads" \
    -v "$APP_ROOT/data:$CONTAINER_DATA_DIR" \
    "$IMAGE:$tag"
  ok "版本切换完成 ($CONTAINER_NAME, tag $tag)"
  echo "  后台服务: $(service_addr)  (外网用服务器 IP 替换 localhost)"
  echo "  状态: cd $APP_ROOT && ./ops/docker/status.sh"
}

case "$MODE" in
  systemd|pm2) switch_symlink "$@" ;;
  docker)      switch_docker "$@" ;;
  *) die "未知 MODE: $MODE" ;;
esac
