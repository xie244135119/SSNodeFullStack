#!/usr/bin/env bash
###
 # Description  backend 顶层部署编排器(服务器侧、纯 shell、单一真相源)
###
# 开发机只负责 buildops + tar + scp 上传 release 包,然后 ssh 触发本脚本。
# 真正的部署力学(releases 轮转 / current 装填 / 密钥注入 / 派发进程安装)全在本脚本,
# 不再由开发机 node-ssh 远程执行 —— 部署模型与运维现场一致,可端到端验证实际问题。
#
# current 形态(按模式):
#   systemd/pm2:current = 软链 → releases/<ver>-<ts>(Capistrano 式;releases 只放业务服务包,
#     各含自己的 node_modules;部署/回滚只改链,原子切换、秒级回滚)。
#   docker:     current = 真实目录(镜像 build context 源;版本靠镜像 tag,不进 releases)。
#   ops/ 共享:ops/ 不进 releases,统一落 APP_ROOT/ops/(与 install.sh 同级、跨版本共享);
#     各 mode 的 config.sh 持久化(运维改的 NODE_BIN/RUN_USER 等跨版本保留)。
#
# 两种场景:
#  1) 首次部署(bootstrap):APP_ROOT 未 baked。交互确认 APP_ROOT 与模式 → 建 releases/data/logs
#     → 拷顶层脚本到 APP_ROOT 并 baked → 落 release 到 releases/<ver>-<ts>(或 docker current)
#     → 落 ops 到 APP_ROOT/ops/ → 种 .env(docker,非空阻断)→ 软链 current(systemd/pm2)→ 派发 mode install。
#  2) 二次部署:APP_ROOT 已 baked。传新 release(tar/目录)→ 停旧 → 落新 release →
#     overlay ops(保留 config.sh)→ 检测 config 非空(systemd/pm2 用 release 自带 config/config.prod.yaml)
#     → 装依赖 → 改链 go-live → 轮转 → 重派发。
#
# 用法:
#   首次:  bash install.sh                       # 在解压后的 release 包根里跑(脚本现位于包根,非 ops/)
#   二次:  bash install.sh <release.tar.gz|dir>   # 在 APP_ROOT 下跑(MODE 已 baked,缺省读 .mode)
#   切版本: bash install.sh                        # 在 APP_ROOT 下裸跑(无参):扫 releases/ 找新丢的
#          buildops 产物包目录并部署切 current(等价显式传 <包目录>,部署后清掉暂存包)
set -euo pipefail

# ── baked 字段(首次为空;bootstrap 拷自身到 APP_ROOT 时 sed 改写为字面量) ──
APP_ROOT="${APP_ROOT:-}"
MODE="${MODE:-}"
KEEP_VERSIONS="${KEEP_VERSIONS:-3}"

# 脚本所在目录(首次=release 包根,即 install.sh 所在的包根;二次=APP_ROOT)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR_DEFAULT="$DIR"   # 首次=release 包根(install.sh 现位于包根,非 ops/)
RELEASE_DIR=""
APP_DIR=""   # releases/<version>/(dist/package.json/Dockerfile/config 所在)
VER=""
STAGE_CLEANUP=""

# 本次部署选定端口(systemd/pm2=yaml 权威,docker=.env PORT 权威)。
# 首部署:prompt_port 必赋值,ensure_secrets 据此写 .env PORT(覆盖 .env.example 的 3001 缺省)。
# 二次部署:仅显式改端口时赋值;沿用当前则留空,ensure_secrets 不动 .env PORT(保留运维护过的值)。
DEPLOY_PORT=""

# 本次部署的工作目录(docker=current;systemd/pm2=releases/<id>,最后软链 current 指向)
DEPLOY_TARGET=""
IS_SYMLINK=0

say() { printf '\033[36m▶\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
err() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

# 便携 sed 原地改(GNU/BSD 均兼容,不依赖 -i 行为差异)
#   用法: _sed_i <file> <sed-expr...>
_sed_i() { local f="$1"; shift; sed "$@" "$f" > "$f.__sed_i" && mv "$f.__sed_i" "$f"; }

# 按 release 目录名末段(最后一个 - 之后)的 14 位时间戳降序列出 releases/。
#   部署目录 = <ver>-<14位ts>(YYYYMMDDHHMMSS),末段即 ts,等长定宽 → 裸字符串倒序即时间倒序(最新在前)。
#   兼容历史格式:无 14 位尾缀的(旧 dashed <ts>-<ver>、残骸目录)落底,不污染顺序。
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

read_version() {
  local d="$1" v
  [[ -f "$d/package.json" ]] || die "找不到 package.json: $d"
  v="$(grep -m1 '"version"' "$d/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [[ -n "$v" ]] || die "无法从 $d/package.json 读 version"
  printf '%s' "$v"
}

# ── 定位 releases/<version>-<ts>/(dist/package.json/Dockerfile/.dockerignore/config 所在) ──
# release 包结构:包根 = install.sh/start.sh/.../ops/releases/<version>-<ts>/。
# 本函数从 RELEASE_DIR(包根)找 releases 下唯一版本目录。
resolve_app_dir() {
  local rd="$1" vdir n
  [[ -d "$rd/releases" ]] || die "$rd/releases 不存在(release 包结构不符:应含 releases/<version>/)"
  vdir="$(ls -1d "$rd/releases"/* 2>/dev/null | head -1 || true)"
  [[ -n "$vdir" ]] || die "$rd/releases 下无版本目录(release 包不完整)"
  n="$(ls -1d "$rd/releases"/* 2>/dev/null | wc -l | tr -d ' ')"
  [[ "$n" = 1 ]] || die "$rd/releases 下有多个版本目录($n),期望唯一"
  printf '%s' "$(cd "$vdir" && pwd)"
}

# ── APP_ROOT 裸跑 ./install.sh(无参、APP_ROOT 已 baked)时:扫 APP_ROOT/releases/ 找
#    运维新丢进来的 buildops 产物包并部署,等价于正常二次部署显式传 <包目录>。
#    产物包判据:目录自身含内层 releases/(正常部署版本目录 <ver>-<ts> 只有 dist/package.json/
#    config;ops 不进 releases、在 APP_ROOT/ops/ 共享,故正常部署目录无内层 releases/)。多个包则交互列选;��署后由 cleanup_staging 清掉暂存包目录。
resolve_dropped_package() {
  local rel="$APP_ROOT/releases" pkgs=() d pick choice i
  [[ -d "$rel" ]] || die "$rel 不存在,无新包可部署。切版本请把 buildops 产物包目录拷入 releases/ 后再跑本脚本,或显式传包: bash $APP_ROOT/install.sh <包目录|tar.gz>"
  # 产物包判据:目录自身含内层 releases/
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    if [[ -d "$d/releases" ]]; then pkgs+=("$d"); fi
  done < <(ls -1d "$rel"/* 2>/dev/null || true)
  if [[ ${#pkgs[@]} -eq 0 ]]; then
    die "后台服务目录的 releases/ 下未发现 buildops 产物包(含内层 releases/ 的目录)。切版本方式:把新包目录拷入 releases/ 后再跑本脚本,或显式传包: bash $APP_ROOT/install.sh <包目录|tar.gz>"
  elif [[ ${#pkgs[@]} -eq 1 ]]; then
    pick="${pkgs[0]}"
  else
    echo "  releases/ 下发现多个 buildops 包,选择要部署的:"
    i=0
    for d in "${pkgs[@]}"; do i=$((i+1)); echo "    $i) $(basename "$d")"; done
    read -rp "  选择 [1]: " choice || choice=""
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ && "$choice" -ge 1 && "$choice" -le ${#pkgs[@]} ]]; then
      pick="${pkgs[$((choice-1))]}"
    else
      die "无效选择: $choice"
    fi
  fi
  say "发现新包: $(basename "$pick")"
  RELEASE_DIR="$(cd "$pick" && pwd)"
  STAGE_CLEANUP="$RELEASE_DIR"   # 部署成功后由 cleanup_staging 清掉(在 APP_ROOT 后代内)
  APP_DIR="$(resolve_app_dir "$RELEASE_DIR")"
  [[ -f "$APP_DIR/dist/main.js" ]] || die "$APP_DIR/dist/main.js 不存在(release 包不完整)"
  [[ -f "$APP_DIR/package.json" ]] || die "$APP_DIR/package.json 不存在"
  VER="$(read_version "$APP_DIR")"
}

# ── 解析 release 入参 → RELEASE_DIR + APP_DIR + VER ──
resolve_release() {
  local arg="${1:-}"
  if [[ -z "$arg" ]]; then
    if [[ -n "$APP_ROOT" ]]; then
      # 无参 + APP_ROOT 已 baked = 运维在 APP_ROOT 裸跑 ./install.sh 切版本:
      # 扫 APP_ROOT/releases/ 找新丢进来的 buildops 产物包并部署(等价二次部署传 <包目录>)。
      resolve_dropped_package
      return
    fi
    RELEASE_DIR="$RELEASE_DIR_DEFAULT"
    [[ -d "$RELEASE_DIR/releases" ]] || die "默认 release 目录 $RELEASE_DIR 无 releases/(应在解压后的 release 包内运行,或显式传包路径)"
  elif [[ -f "$arg" && "$arg" == *.tar.gz ]]; then
    [[ -n "$APP_ROOT" ]] || die "传 tar 包但后台服务目录未 baked(首次部署请先在解压目录里跑一次本脚本完成引导)"
    local ts; ts="$(date +%Y%m%d-%H%M%S)"
    RELEASE_DIR="$APP_ROOT/.stage-$ts"
    rm -rf "$RELEASE_DIR"; mkdir -p "$RELEASE_DIR"
    tar -xzf "$arg" -C "$RELEASE_DIR"
    # 兼容手动打包带顶层目录:若解压出单一子目录,下钻
    local first n
    first="$(ls -A "$RELEASE_DIR" 2>/dev/null | head -1 || true)"
    n="$(ls -A "$RELEASE_DIR" 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$n" = 1 && -d "$RELEASE_DIR/$first" ]]; then
      local tmp="$RELEASE_DIR.tmp"
      mv "$RELEASE_DIR" "$tmp"; mv "$tmp/$first" "$RELEASE_DIR"; rm -rf "$tmp"
    fi
    STAGE_CLEANUP="$RELEASE_DIR"
  elif [[ -d "$arg" ]]; then
    RELEASE_DIR="$(cd "$arg" && pwd)"
  else
    die "无法识别的 release 入参: $arg (期望 .tar.gz 或目录)"
  fi
  APP_DIR="$(resolve_app_dir "$RELEASE_DIR")"
  [[ -f "$APP_DIR/dist/main.js" ]] || die "$APP_DIR/dist/main.js 不存在(release 包不完整)"
  [[ -f "$APP_DIR/package.json" ]] || die "$APP_DIR/package.json 不存在"
  VER="$(read_version "$APP_DIR")"
}

prompt_app_root() {
  # 若发布脚本给了 APP_ROOT_HINT(=backendServiceDir,即 tar 上传目标),直接采用,免手输
  if [[ -n "${APP_ROOT_HINT:-}" ]]; then
    mkdir -p "$APP_ROOT_HINT"   # 首部署允许目标目录尚不存在(场景一)
    APP_ROOT="$(cd "$APP_ROOT_HINT" && pwd)"
    say "后台服务目录=$APP_ROOT(来自发布配置)"
    return
  fi
  # 启发默认:脚本目录名形如 backend-<14位时间戳> → 视为拷入 APP_ROOT 的暂存包子目录,
  #   默认 APP_ROOT=父目录(方案A:包恒为暂存);否则(运维已把包更名/摊开成 APP_ROOT,场景三)
  #   默认=当前目录。仍弹交互让运维确认,避免拷到 /tmp 等临时位置时默认错。
  local dir_base default_app_root choice manual
  dir_base="$(basename "$DIR")"
  if [[ "$dir_base" =~ ^backend-[0-9]{14}$ && "$DIR" != "/" ]]; then
    default_app_root="$(cd "$DIR/.." && pwd)"
  else
    default_app_root="$DIR"
  fi
  echo
  say "后台服务目录未配置,进入首次部署引导(脚本目录: $DIR)"
  echo "  选择后台服务目录(current/releases/data/logs 所在):"
  echo "    1) $default_app_root"
  echo "    2) 当前目录  $DIR  (推荐)"
  echo "    3) 手动输入路径"
  read -rp "  选择 [2]: " choice || choice=""
  case "$choice" in
    1) APP_ROOT="$default_app_root" ;;
    3) read -rp "  输入后台服务目录绝对路径: " manual || manual=""
       manual="${manual%%$'\n'}"
       [[ -n "$manual" ]] || die "未输入路径"
       APP_ROOT="$manual" ;;
    *) APP_ROOT="$DIR" ;;
  esac
  mkdir -p "$APP_ROOT"   # 首部署允许新建 APP_ROOT(场景一:目录可能尚不存在)
  APP_ROOT="$(cd "$APP_ROOT" && pwd)"
}

prompt_mode() {
  local choice
  echo "  请选择部署方式:"
  echo "    1) docker    (推荐)"
  echo "    2) systemd"
  echo "    3) pm2"
  read -rp "  选择 [1]: " choice || choice=""
  case "$choice" in
    2) MODE="systemd" ;;
    3) MODE="pm2" ;;
    *) MODE="docker" ;;
  esac
}

# ── 运行端口首次确认 ──
# 端口 = release 自带 config.prod.yaml 的 app.port;systemd/pm2=app 直监听(yaml 为权威),
# docker=宿主映射=容器内监听(.env PORT 为权威,yaml 仅作镜像内兜底默认)。
# 回车=采纳当前值;输入合法端口=就地 sed 改 release 的 yaml(随包拷入 current,镜像兜底对齐),
# 并记入 DEPLOY_PORT:ensure_secrets 据此把 .env 的 PORT 改为同值(docker 权威,部署即生效)。
# 二次部署端口变更由 deploy() 另行确认。
prompt_port() {
  local port input
  port="$(yaml_scalar "$APP_DIR/config/config.prod.yaml" port 2>/dev/null | head -1 || true)"
  [[ -n "$port" ]] || port="3001"
  echo "  后端运行端口(来自 config.prod.yaml app.port = $port;systemd/pm2=app 直监听,docker=宿主映射)"
  read -rp "  回车确认此端口,或输入新端口直接改 yaml: " input || input=""
  input="${input%%$'\n'}"
  if [[ -z "$input" ]]; then
    ok "运行端口: $port(来自 config.prod.yaml)"
    DEPLOY_PORT="$port"
    return 0
  fi
  # 校验合法端口(1-65535)后就地改 release 源 yaml;与当前同值则不动
  if [[ ! "$input" =~ ^[0-9]+$ || "$input" -lt 1 || "$input" -gt 65535 ]]; then
    die "无效端口: $input(期望 1-65535 的数字;手动改请编辑 $APP_DIR/config/config.prod.yaml 的 app.port 后重跑)"
  fi
  if [[ "$input" == "$port" ]]; then
    ok "运行端口: $port(未变更)"
    DEPLOY_PORT="$port"
    return 0
  fi
  _sed_i "$APP_DIR/config/config.prod.yaml" -E "s|^([[:space:]]*port:[[:space:]]*).*|\1$input|"
  DEPLOY_PORT="$input"
  ok "已改 $APP_DIR/config/config.prod.yaml app.port: $port → $input(systemd/pm2=yaml 权威;docker=.env PORT 权威,由 ensure_secrets 写入)"
}

TOP_SCRIPTS=(install.sh start.sh stop.sh versionswitch.sh status.sh)

# ── 计算本次部署目标目录 ──
resolve_work_dir() {
  # 14 位连写时间戳(YYYYMMDDHHMMSS,与 buildops tsNow 同口径):等长定宽,裸字符串倒序即时间倒序
  local ts; ts="$(date +%Y%m%d%H%M%S)"
  if [[ "$MODE" == "docker" ]]; then
    DEPLOY_TARGET="$APP_ROOT/current"   # 真实目录(镜像 build context 源)
    IS_SYMLINK=0
  else
    DEPLOY_TARGET="$APP_ROOT/releases/${VER}-${ts}"   # <ver>-<ts>,与 buildops 包内层目录同构
    IS_SYMLINK=1
  fi
}

# ── 落 release 到 DEPLOY_TARGET(releases/ 只放业务服务包:dist/package.json/Dockerfile/
#    .dockerignore/docker-compose.yml/config;ops/ 不进 releases,由 lay_out_ops 放 APP_ROOT/ops 共享) ──
# docker=重建 current;systemd/pm2=新建 releases/<ver>-<ts>,先不动 current 软链
lay_out_release() {
  if [[ "$IS_SYMLINK" = 1 ]]; then
    if [[ "$APP_DIR" -ef "$DEPLOY_TARGET" ]]; then
      : # 场景三(包更名成 APP_ROOT)且部署与打包同秒:APP_DIR 即 DEPLOY_TARGET,内容已在位,不拷不删
    else
      [[ -e "$DEPLOY_TARGET" ]] && rm -rf "$DEPLOY_TARGET"
      mkdir -p "$DEPLOY_TARGET"
      cp -a "$APP_DIR/." "$DEPLOY_TARGET/"
    fi
  else
    rm -rf "$APP_ROOT/current"
    mkdir -p "$APP_ROOT/current"
    cp -a "$APP_DIR/." "$APP_ROOT/current/"
  fi
  # 删源内层版本目录(内容已拷入 DEPLOY_TARGET)。用 -ef 判同路径(场景三同秒时 = 目标自身,不删);
  # 其余情形 APP_DIR(包内层 <ver>-<pkgTs>)与 DEPLOY_TARGET(<ver>-<deployTs>)路径不同,安全删。
  [[ "$APP_DIR" -ef "$DEPLOY_TARGET" ]] || rm -rf "$APP_DIR"
}

# ── lay out ops/ 到 APP_ROOT/ops/(共享、跨版本;releases/ 不放 ops) ──
#    每次部署 overlay 刷新 mode 脚本 / sqlite / 文档,但各 mode 的 config.sh 持久化
#    (运维改的 NODE_BIN/RUN_USER/DATA_DIR 等跨版本不丢;首次用包内 config.sh 作种子)。
lay_out_ops() {
  local src="$RELEASE_DIR/ops" sub name f fn
  [[ -d "$src" ]] || die "缺 $src(release 包不完整)"
  mkdir -p "$APP_ROOT/ops"
  # 场景三(包更名成 APP_ROOT,RELEASE_DIR==APP_ROOT):包 ops 即共享 ops,已在位,无需拷(否则 cp 拷自身报错)
  if [[ "$src" -ef "$APP_ROOT/ops" ]]; then
    ok "ops 就位: $APP_ROOT/ops(场景三:包即 APP_ROOT,ops 原地保留)"
    return 0
  fi
  for sub in "$src"/*; do
    [[ -e "$sub" ]] || continue
    name="$(basename "$sub")"
    if [[ -d "$sub" ]]; then
      # mode 目录(docker/pm2/systemd/sqlite):刷新其中脚本,保留运维护过的 config.sh
      mkdir -p "$APP_ROOT/ops/$name"
      for f in "$sub"/*; do
        [[ -e "$f" ]] || continue
        fn="$(basename "$f")"
        # config.sh:APP_ROOT 已有则保留(运维改的跨版本不丢);无则用包内种子
        [[ "$fn" == "config.sh" && -f "$APP_ROOT/ops/$name/config.sh" ]] && continue
        cp -af "$f" "$APP_ROOT/ops/$name/"
      done
    else
      cp -af "$sub" "$APP_ROOT/ops/"
    fi
  done
  ok "ops 就位: $APP_ROOT/ops(共享跨版本;各 config.sh 已保留)"
}

# ── 刷新顶层脚本(install/start/stop/versionswitch/status.sh)到 APP_ROOT/ ──
#    首次部署由 bootstrap bake 一次;二次部署用新 release 包根的同名脚本 overlay,
#    让顶层脚本的修复能随 publish 下发(不再"bake 一次就冻住")。re-bake 当前
#    APP_ROOT/MODE(顶层脚本无运维可改字段,直接覆盖;与 lay_out_ops 保留 config.sh 不同)。
#    安全:写 temp + mv 替换目录项,bash 持有运行脚本的旧 inode 存活至进程退出
#    (不 cp 直写同 inode —— 会 truncate 正在运行的 install.sh 致其读崩)。
refresh_top_scripts() {
  [[ -n "$APP_ROOT" && -n "$MODE" && -n "$RELEASE_DIR" ]] || return 0
  local s src dst baked=0
  for s in "${TOP_SCRIPTS[@]}"; do
    src="$RELEASE_DIR/$s"
    [[ -f "$src" ]] || continue
    dst="$APP_ROOT/$s"
    # 从新 release 源 bake(注入当前 APP_ROOT/MODE 字面量)→ temp → mv 替换目录项
    sed -e "s|^APP_ROOT=.*|APP_ROOT=\"$APP_ROOT\"|" -e "s|^MODE=.*|MODE=\"$MODE\"|" "$src" > "$dst.__new"
    mv -f "$dst.__new" "$dst"
    chmod +x "$dst"
    baked=$((baked+1))
  done
  [[ $baked -gt 0 ]] && ok "顶层脚本刷新:$baked 个(baked APP_ROOT=$APP_ROOT MODE=$MODE,随 release 下发)"
}

# ── 密钥非空检测(只拦空值,不拦占位串) ──
# 取 yaml 标量值:去 "key:" 前缀、首尾空白与引号;空即未设
yaml_scalar() {
  sed -nE "s/^[[:space:]]*$2:[[:space:]]*//p" "$1" \
    | sed -E "s/^['\"]?//; s/['\"]?$//; s/^[[:space:]]+//; s/[[:space:]]+$//"
}
check_yaml_secrets() {
  local f="$1" bad=0 sk jwt
  sk="$(yaml_scalar "$f" signKey)"
  jwt="$(yaml_scalar "$f" secret)"
  [[ -z "$sk" ]] && { err "appSign.signKey 未设(空)"; bad=1; }
  [[ -z "$jwt" ]] && { err "jwt.secret 未设(空)"; bad=1; }
  [[ $bad -eq 1 ]] && die "请编辑 $f 填入生产真值后重新执行首次部署: bash $DIR/install.sh"
  return 0
}
check_env_secrets() {
  local f="$1" bad=0 jwt appsign
  jwt="$(grep -E '^JWT_SECRET=' "$f" | cut -d= -f2- || true)"
  appsign="$(grep -E '^APP_SIGN_KEY=' "$f" | cut -d= -f2- || true)"
  [[ -z "$jwt" ]] && { err "JWT_SECRET 未设(空)"; bad=1; }
  [[ -z "$appsign" ]] && { err "APP_SIGN_KEY 未设(空)"; bad=1; }
  [[ $bad -eq 1 ]] && die "请编辑 $f 填入生产真值后重新执行首次部署: bash $DIR/install.sh"
  return 0
}

# ── 配置/密钥(无 APP_ROOT/config.yaml 权威层;systemd/pm2 直用 release 自带 config.yaml,
#    app 以 cwd=current 直读、运维改 current/config.yaml + restart 即生效;docker 用 APP_ROOT/.env) ──
ensure_secrets() {
  local t="$DEPLOY_TARGET"
  if [[ "$MODE" == "docker" ]]; then
    if [[ ! -f "$APP_ROOT/.env" ]]; then
      local seed="$RELEASE_DIR/ops/docker/.env.example"
      [[ -f "$seed" ]] || seed="$APP_ROOT/ops/docker/.env.example"   # 共享 ops(lay_out_ops 已就位)
      [[ -f "$seed" ]] || die "缺 .env.example,无法种子化 $APP_ROOT/.env"
      cp -f "$seed" "$APP_ROOT/.env"
    fi
    # 对齐本次部署的 IMAGE/TAG/DATA_DIR/CONTAINER_NAME(IMAGE/TAG 与 config.sh 构建一致;
    # --env-file 把 .env 全量灌进容器,含 PORT/密钥)。
    # PORT:仅当本次部署显式选定端口(DEPLOY_PORT 非空)时才写 .env。
    #   首部署:prompt_port 必赋值,覆盖 .env.example 的 3001 缺省 → docker 端口权威生效。
    #   二次部署:仅显式改端口时赋值;沿用当前则留空,保留运维护过的 .env PORT。
    local port_e=""
    [[ -n "$DEPLOY_PORT" ]] && port_e="-e s|^PORT=.*|PORT=$DEPLOY_PORT|"
    _sed_i "$APP_ROOT/.env" \
      -e "s|^TAG=.*|TAG=$VER|" \
      -e "s|^DATA_DIR=.*|DATA_DIR=$APP_ROOT/data|" \
      -e "s|^CONTAINER_NAME=.*|CONTAINER_NAME=g-fullstack-backend|" \
      $port_e
    check_env_secrets "$APP_ROOT/.env"
    ok "docker env: $APP_ROOT/.env (TAG=$VER)"
  else
    # systemd/pm2:config/config.prod.yaml 随 release(current 软链指向),app 以 cwd=current
    # 经 resolveConfig 命中 cwd/config/config.<env>.yaml 直读。不拷贝、不注入字段(数据目录由
    # mode install 经 DB_DIR env 注入 = APP_ROOT/data,跨版本共享)。仅非空阻断(仓库
    # config.prod.yaml 已带真值则直接过)。
    [[ -f "$t/config/config.prod.yaml" ]] || die "缺 $t/config/config.prod.yaml(release 包不完整)"
    check_yaml_secrets "$t/config/config.prod.yaml"
    ok "config: $t/config/config.prod.yaml(release 自带,改后 restart 即生效)"
  fi
}

# ── go-live:systemd/pm2 原子改软链 current → DEPLOY_TARGET;docker 已直接落 current ──
go_live() {
  [[ "$IS_SYMLINK" = 0 ]] && return 0
  # current 若是真实目录(旧模型遗留),先清成可软链
  if [[ -e "$APP_ROOT/current" && ! -L "$APP_ROOT/current" ]]; then rm -rf "$APP_ROOT/current"; fi
  ln -sfn "$DEPLOY_TARGET" "$APP_ROOT/current"
  ok "已切换版本: $(basename "$DEPLOY_TARGET")"
}

dispatch_install() {
  local mode_install="$APP_ROOT/ops/$MODE/install.sh"   # 共享 ops(releases 不放 ops)
  [[ -f "$mode_install" ]] || die "缺 mode 安装脚本: $mode_install(先跑 lay_out_ops 或检查后台服务目录/ops)"
  say "派发 $MODE 安装: $mode_install"
  export APP_ROOT MODE
  bash "$mode_install"
}

rotate_releases() {
  [[ "$IS_SYMLINK" = 0 ]] && return 0   # docker 不用 releases
  local list=()
  while IFS= read -r d; do list+=("$d"); done < <(sort_releases "$APP_ROOT/releases")
  [[ ${#list[@]} -le $KEEP_VERSIONS ]] && return 0
  local del=("${list[@]:$KEEP_VERSIONS}")
  # 不删当前软链指向的版本(防御)
  local cur_target; cur_target="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
  local d
  for d in "${del[@]}"; do
    [[ -n "$d" ]] || continue
    [[ "$(readlink -f "$d" 2>/dev/null)" = "$cur_target" ]] && continue
    rm -rf "$d"
  done
  ok "轮转:保留 $KEEP_VERSIONS 份,清理旧版本"
}

# ── 清暂存包子目录(方案A:包作为暂存子目录拷入 APP_ROOT,部署成功后清掉,对齐 publish.cjs 清 .bootstrap) ──
# 仅清 APP_ROOT 的真子目录(DIR/RELEASE_DIR/STAGE_CLEANUP);场景三(DIR==APP_ROOT,包更名成 APP_ROOT)不清。
cleanup_staging() {
  local p
  for p in "$DIR" "$RELEASE_DIR" "$STAGE_CLEANUP"; do
    [[ -n "$p" ]] || continue
    [[ "$p" == "$APP_ROOT"/* ]] || continue        # 只清 APP_ROOT 后代
    [[ "$p" -ef "$APP_ROOT" ]] && continue          # 排除 APP_ROOT 自身
    rm -rf "$p" 2>/dev/null || true
  done
}

# ════════════════════════════════════════════════════════════════
#  bootstrap
# ════════════════════════════════════════════════════════════════
bootstrap() {
  [[ -z "$APP_ROOT" ]] || die "bootstrap 不应带 baked 后台服务目录"
  prompt_app_root
  [[ -n "$MODE" ]] || prompt_mode
  prompt_port

  say "初始化目录: $APP_ROOT"
  mkdir -p "$APP_ROOT"/{releases,data,logs}
  # current 不预建(systemd/pm2 由 go_live 建软链;docker 由 lay_out_release 建目录)

  # 拷顶层脚本到 APP_ROOT 并 bake。场景三(包更名成 APP_ROOT,DIR==APP_ROOT)时
  # cp 同文件会 exit1 致死(set -e) → 跳过 cp 直接就地 _sed_i bake。
  # bash 持有运行脚本的 open fd,rm/改自身目录项不影响读取(inode 存活至进程退出)。
  local s src dst same=0
  [[ "$(cd "$DIR" && pwd -P)" = "$(cd "$APP_ROOT" && pwd -P)" ]] && same=1
  for s in "${TOP_SCRIPTS[@]}"; do
    src="$DIR/$s"; dst="$APP_ROOT/$s"
    [[ -f "$src" ]] || die "缺顶层脚本 $src(release 包不完整)"
    [[ $same -eq 0 ]] && cp -f "$src" "$dst"
    _sed_i "$dst" -e "s|^APP_ROOT=.*|APP_ROOT=\"$APP_ROOT\"|" -e "s|^MODE=.*|MODE=\"$MODE\"|"
    chmod +x "$dst"
  done
  echo "$MODE" > "$APP_ROOT/.mode"
  ok "顶层脚本就位:baked APP_ROOT=$APP_ROOT MODE=$MODE"

  resolve_work_dir
  lay_out_release
  lay_out_ops
  ok "release 就位: $DEPLOY_TARGET (v$VER)"

  ensure_secrets

  if [[ "$MODE" != "docker" ]]; then
    say "安装生产依赖 npm i --omit=dev ..."
    (cd "$DEPLOY_TARGET" && npm i --omit=dev --legacy-peer-deps --no-audit --no-fund) \
      || { rm -rf "$DEPLOY_TARGET"; die "npm i 失败,已清理半成品 release(无 node_modules,避免污染回滚列表): $DEPLOY_TARGET"; }
    ok "依赖就绪"
  fi

  go_live
  rotate_releases
  dispatch_install
  ok "首次部署完成 ✓"
  echo "  端口: $(yaml_scalar "$DEPLOY_TARGET/config/config.prod.yaml" port 2>/dev/null | head -1 || echo 3001)(来自 config.prod.yaml,nginx 反代到 http://localhost:<port>/api)"
  echo "  管理: cd $APP_ROOT && ./start.sh | ./stop.sh | ./status.sh 2>/dev/null || true"
  echo "  版本切换(回滚/升级): cd $APP_ROOT && ./versionswitch.sh"
  cleanup_staging
}

# ════════════════════════════════════════════════════════════════
#  deploy
# ════════════════════════════════════════════════════════════════
deploy() {
  [[ -n "$APP_ROOT" ]] || die "二次部署:后台服务目录未 baked(应在后台服务目录下的 install.sh 内运行)"
  [[ -n "$MODE" ]] || MODE="$(cat "$APP_ROOT/.mode" 2>/dev/null || true)"
  [[ -n "$MODE" ]] || die "缺 MODE(无 baked、无 .mode 文件)"

  # 二次部署端口确认:
  #   systemd/pm2:yaml app.port 为权威(改新 release yaml,app cwd=current 直读)。
  #   docker:.env PORT 为权威(改新 release yaml 作镜像兜底 + DEPLOY_PORT 由 ensure_secrets 写 .env)。
  #   回车=沿用当前运行端口(就地 sed 改新 release yaml 对齐,nginx 不受影响);输入合法端口=就地 sed 改 yaml
  #   且 docker 模式记 DEPLOY_PORT → ensure_secrets 写 .env PORT(权威)。同端口静默。
  local new_port cur_port dp_input
  new_port="$(yaml_scalar "$APP_DIR/config/config.prod.yaml" port 2>/dev/null | head -1 || true)"
  if [[ "$MODE" == "docker" && -f "$APP_ROOT/.env" ]]; then
    # docker 当前运行端口权威 = .env PORT(非 yaml)
    cur_port="$(sed -nE 's/^PORT=//p' "$APP_ROOT/.env" | head -1 | sed -E "s/^['\"]?//; s/['\"]?$//; s/^[[:space:]]+//; s/[[:space:]]+$//")"
  else
    cur_port="$(yaml_scalar "$APP_ROOT/current/config/config.prod.yaml" port 2>/dev/null | head -1 || true)"
  fi
  if [[ -n "$new_port" && -n "$cur_port" && "$new_port" != "$cur_port" ]]; then
    echo
    say "⚠ 端口不一致:当前运行端口=$cur_port,新版本 app.port=$new_port"
    echo "  ($([[ "$MODE" == "docker" ]] && echo 'docker 权威=.env PORT' || echo 'yaml 为权威');回车=沿用当前端口 $cur_port,或输入新端口)"
    read -rp "  回车沿用当前端口,或输入新端口: " dp_input || dp_input=""
    dp_input="${dp_input%%$'\n'}"
    if [[ -z "$dp_input" ]]; then
      # 沿用当前运行端口:改新 release yaml 对齐(镜像兜底);.env PORT(docker)不动
      _sed_i "$APP_DIR/config/config.prod.yaml" -E "s|^([[:space:]]*port:[[:space:]]*).*|\1$cur_port|"
      ok "运行端口对齐当前: $cur_port(已改新 release config.prod.yaml)"
    elif [[ ! "$dp_input" =~ ^[0-9]+$ || "$dp_input" -lt 1 || "$dp_input" -gt 65535 ]]; then
      die "无效端口: $dp_input(期望 1-65535 的数字;手动改请编辑 $APP_DIR/config/config.prod.yaml 的 app.port 后重跑)"
    else
      _sed_i "$APP_DIR/config/config.prod.yaml" -E "s|^([[:space:]]*port:[[:space:]]*).*|\1$dp_input|"
      DEPLOY_PORT="$dp_input"   # docker:由 ensure_secrets 写入 .env PORT(权威)
      ok "已改新 release app.port: $new_port → $dp_input($([[ "$MODE" == "docker" ]] && echo 'docker 写 .env PORT' || echo 'yaml 权威'),部署即生效)"
    fi
  elif [[ -n "$new_port" ]]; then
    say "运行端口: $new_port(与当前一致)"
  fi

  local cur_ver=""
  [[ -L "$APP_ROOT/current" && -f "$APP_ROOT/current/package.json" ]] && cur_ver="$(read_version "$APP_ROOT/current")" || true
  [[ -z "$cur_ver" && -d "$APP_ROOT/current" && -f "$APP_ROOT/current/package.json" ]] && cur_ver="$(read_version "$APP_ROOT/current")" || true
  say "二次部署 v$VER(当前 v${cur_ver:-未知}, mode=$MODE)"

  resolve_work_dir

  # 停旧(best-effort)
  say "停止旧服务..."
  bash "$APP_ROOT/stop.sh" 2>/dev/null || true

  lay_out_release
  lay_out_ops
  ok "release 就位: $DEPLOY_TARGET (v$VER)"

  refresh_top_scripts

  ensure_secrets

  if [[ "$MODE" != "docker" ]]; then
    say "安装生产依赖 npm i --omit=dev ..."
    (cd "$DEPLOY_TARGET" && npm i --omit=dev --legacy-peer-deps --no-audit --no-fund) \
      || { rm -rf "$DEPLOY_TARGET"; die "npm i 失败,已清理半成品 release(无 node_modules,避免污染回滚列表): $DEPLOY_TARGET"; }
    ok "依赖就绪"
  fi

  go_live
  rotate_releases
  dispatch_install

  cleanup_staging
  ok "部署完成 v$VER ✓"
  echo "  端口: $(yaml_scalar "$DEPLOY_TARGET/config/config.prod.yaml" port 2>/dev/null | head -1 || echo 3001)(来自 config.prod.yaml)  状态: cd $APP_ROOT && ./ops/$MODE/status.sh"
}

# ════════════════════════════════════════════════════════════════
RELEASE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP_VERSIONS="$2"; shift 2 ;;
    *) RELEASE_ARG="$1"; shift ;;
  esac
done

resolve_release "$RELEASE_ARG"

if [[ -z "$APP_ROOT" ]]; then bootstrap; else deploy; fi
