#!/usr/bin/env bash
# SQLite 运维共用配置 —— 运维按环境改这一处即可,backup/restore/healthcheck 都 source 它。
# 与 backend/ops/{docker,systemd,pm2} 的 config.sh 同款:绝对路径、${VAR:-default} env override。
#
# 配置项(DATA_DIR/ENV/DB_NAME/KEEP)既可在此改,也可由 deploy cron 行或手动 --db/--env/--keep/--data-dir 覆盖。
# 不重新打包服务:这些脚本只读 data 目录做文件操作,改值 + 重跑脚本即生效,与 backend 发布解耦。
#
# 约定(与 deploy 迁移前备份、ops 页探针保持一致,勿改):
#   - 备份目录:${DATA_DIR}/backup/${TAG}.<ts>/   (单文件自洽主库,WAL 已并入)
#   - 日志文件:${DATA_DIR}/logs/sqlite-backup.log      (ops 页 SqliteBackupLogProbe 读此文件尾;
#     ❌ 行被探针判异常,故各脚本只在真失败时打 ❌,成功打 ✅)

# 环境(develop|prod,决定 DB_NAME/备份目录名 <env>.sqlite / <env>.<ts>)
ENV="prod"
# 数据目录(sqlite + uploads + backup + logs 所在;docker 下即 data volume 源=宿主真实目录)
DATA_DIR="/data/server/g-fullstack/data"
# 主库文件名(留空则 sqlite_derive 按 ENV 推导,与 app 代码定死的文件名一致:
# prod=g-fullstack.prod.sqlite / dev=g-fullstack.dev.sqlite;--db 显式覆盖)。
# 文件名由 app 定死不外配,此处仅作运维定位/备份 tag 用,改值须与 app 代码同步。
DB_NAME=""
# 主库路径(留空则由 sqlite_derive 推导为 ${DATA_DIR}/${DB_NAME};--db 显式覆盖)
DB=""
# 备份保留份数
KEEP=7

# ── 派生路径(脚本解析完参数后调 sqlite_derive 一次性算定)──
BACKUP_DIR=""
LOG_DIR=""
LOG_FILE=""
TAG=""

sqlite_derive() {
  BACKUP_DIR="${DATA_DIR}/backup"
  LOG_DIR="${DATA_DIR}/logs"
  LOG_FILE="${LOG_DIR}/sqlite-backup.log"
  # DB_NAME 未显式设定则按 ENV 推导,与 app 代码定死的文件名一致:
  #   prod → g-fullstack.prod.sqlite / dev → g-fullstack.dev.sqlite(--env 覆盖 ENV 后此处同步生效)。
  if [[ -z "$DB_NAME" ]]; then
    if [[ "$ENV" == "prod" ]]; then DB_NAME="g-fullstack.prod.sqlite";
    else DB_NAME="g-fullstack.dev.sqlite"; fi
  fi
  # TAG = DB 文件名去扩展名,用作备份目录名前缀(<tag>.<ts>)与轮转/回退 glob。
  # DB_NAME=g-fullstack.prod.sqlite → TAG=g-fullstack.prod;DB_NAME=prod.sqlite → TAG=prod。
  TAG="${DB_NAME%.*}"
  # 注意:用 if/then 而非 [[ -z ]] && DB=... —— 后者在 DB 非空时整句返回 1,
  # 在 set -e 下会让 sqlite_derive 返回 1 致脚本中途退出。
  if [[ -z "$DB" ]]; then DB="${DATA_DIR}/${DB_NAME}"; fi
}

# 时间戳:目录名用 YYYYMMDD-HHMMSS(与 releases/<ts> 同款,字典序≈时间序)
_ts()  { date '+%Y%m%d-%H%M%S'; }
_now() { date '+%Y-%m-%d %H:%M:%S'; }

# 日志:同时落 LOG_FILE + stdout。cron 行重定向 stdout→/dev/null,LOG_FILE 留记录;手动跑两边都见。
# LOG_FILE 不可写(目录缺失/权限)时只打 stdout,不致脚本失败。
sqlite_log() {
  local msg="[$(_now)] $*"
  echo "$msg"
  if [[ -n "${LOG_FILE:-}" ]]; then
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    printf '%s\n' "$msg" >> "$LOG_FILE" 2>/dev/null || true
  fi
}

# 宿主是否有 sqlite3 CLI
sqlite_has_cli() { command -v sqlite3 >/dev/null 2>&1; }

# 文件头魔数判定(SQLite 文件头 15 字节 = "SQLite format 3",第 16 字节为 NUL)。
# 只比首 15 字节的可打印串,避开 NUL —— 兼容 GNU/BSD grep 与 macOS/Linux/macOS sh。
# (旧法 head -c 16 | grep -q $'...\x00' 在 BSD grep 下匹配 NUL 失败,故弃用。)
sqlite_is_valid() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  [[ "$(head -c 15 "$f")" = "SQLite format 3" ]]
}

# 备份轮转:按目录名时间戳倒序,删超 keep 份。
# while 在子 shell 里跑(管道),计数取不回主 shell,故另用 ls|wc 统计删除数。
sqlite_rotate() {
  local bdir="$1" tag="$2" keep="$3"
  local i=0 total deleted
  ls -1d "${bdir}"/${tag}.* 2>/dev/null | sort -r | while read -r d; do
    i=$((i + 1))
    # if/then 而非 [[ ]] && rm:i<=keep 时整句返回 1 会触发 set -e 退出子 shell 致轮转中断
    if [[ "$i" -gt "$keep" ]]; then rm -rf "$d"; fi
  done
  total=$(ls -1d "${bdir}"/${tag}.* 2>/dev/null | wc -l | tr -d ' ')
  deleted=$((total - keep))
  # if/then 而非 [[ ]] && sqlite_log,避免 deleted<=0 时 set -e 中途退出
  if [[ "$deleted" -gt 0 ]]; then sqlite_log "🧹 轮转:保留 $keep 份(当前共 $total 份),已删 $deleted 份旧备份"; fi
}
