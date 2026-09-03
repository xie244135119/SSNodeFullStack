#!/usr/bin/env bash
# systemd 部署共用配置 —— 运维按环境改这一处即可,各脚本都 source 它。
# 改完不用重新打包服务:systemd unit 读的是这里的值(install 时生成),配置项
# (端口/dataDir/signKey 等)在 current/config/config.<ENV>.yaml 里,改 yaml + restart 即生效。

# 服务名(unit 文件名 = $SERVICE.service)
SERVICE="g-fullstack-backend"
# 环境(决定进程读 config.<ENV>.yaml,prod 不开 synchronize、启动自动跑迁移)
ENV="prod"
# 后端根目录(current / releases / data / logs 所在)
#   - 正常由顶层 baked 脚本(start/stop/install/versionswitch)导出 APP_ROOT 环境变量,此处直读、锁定不询问。
#   - 直接跑 mode 脚本(未经顶层封装)时,按脚本位置推导为 ops/<mode> 的上两级(即 APP_ROOT)。
#   - 也可 export APP_ROOT=/xxx 显式指定(锁定、不询问)。
APP_ROOT="${APP_ROOT:-}"
# node 绝对路径(非交互 systemd 不加载 shell rc,必须绝对)
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
# 运行用户
RUN_USER="${RUN_USER:-root}"

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
    # 未由顶层脚本导出时,按脚本位置推导:$APP_ROOT/ops/systemd/install.sh → 上两级
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

# 非 root 自动 sudo(systemctl 写 /etc/systemd 需 root)
if [[ $EUID -ne 0 ]]; then SUDO="sudo"; else SUDO=""; fi
