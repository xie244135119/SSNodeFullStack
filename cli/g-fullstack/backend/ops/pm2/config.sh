#!/usr/bin/env bash
# pm2 部署共用配置 —— 运维按环境改这一处即可。
# 配置项(端口/dataDir/signKey 等)在 current/config/config.<ENV>.yaml 里,
# 改 yaml + pm2 restart 即生效,不重新打包服务。

# pm2 应用名
APP_NAME="g-fullstack-backend"
# 环境(决定读 config.<ENV>.yaml)
ENV="prod"
# 后端根目录(current / releases / data / logs 所在)
#   - 正常由顶层 baked 脚本(start/stop/install/versionswitch)导出 APP_ROOT 环境变量,此处直读、锁定不询问。
#   - 直接跑 mode 脚本(未经顶层封装)时,按脚本位置推导为 ops/<mode> 的上两级(即 APP_ROOT)。
#   - 也可 export APP_ROOT=/xxx 显式指定(锁定、不询问)。
APP_ROOT="${APP_ROOT:-}"
# pm2 可执行(非交互环境若找不到,改绝对路径如 /usr/local/bin/pm2)
PM2_BIN="${PM2_BIN:-pm2}"
# 实例数(单实例 fork;SQLite 单文件写串行,不建议 cluster 多实例)
INSTANCES="${INSTANCES:-1}"

# ── 派生路径(APP_ROOT 定下来后才能算;由 resolve_app_root 调用) ──
derive_paths() {
  CURRENT_DIR="$APP_ROOT/current"
  RELEASES_DIR="$APP_ROOT/releases"
  DATA_DIR="$APP_ROOT/data"
  LOG_DIR="$APP_ROOT/logs"
}

# ── 解析 APP_ROOT ── 优先级:顶层 baked 脚本导出的环境变量 > 脚本位置推导。
#    正常由顶层 start/stop/install/versionswitch 导出 APP_ROOT,此处直读;直接跑 mode 脚本时按位置推导。
resolve_app_root() {
  if [[ -z "${APP_ROOT:-}" ]]; then
    # 未由顶层脚本导出时,按脚本位置推导:$APP_ROOT/ops/pm2/install.sh → 上两级
    APP_ROOT="$(cd "$DIR/../.." 2>/dev/null && pwd)" || {
      echo "✗ 无法从脚本路径推导 APP_ROOT($DIR),请 export APP_ROOT 或在 config.sh 显式设置" >&2
      exit 1
    }
  fi
  # 校验 APP_ROOT 是目录(推导/输错在此挡下)
  if [[ ! -d "$APP_ROOT" ]]; then
    echo "✗ APP_ROOT 不是目录: $APP_ROOT" >&2
    exit 1
  fi
  derive_paths
}

# 各脚本 source 时自动解析一次(此后 CURRENT_DIR/... 等即就绪)
resolve_app_root
