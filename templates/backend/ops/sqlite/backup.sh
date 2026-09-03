#!/usr/bin/env bash
# SQLite 在线备份 —— 宿主 sqlite3 .backup 产单文件自洽快照(WAL 已并入),不依赖 node。
# cron 与手动均用此脚本;产物落 ${DATA_DIR}/backup/${TAG}.<ts>/<basename>,按 KEEP 轮转。
# 日志 >> ${DATA_DIR}/logs/sqlite-backup.log(ops 页 SqliteBackupLogProbe 读此文件;❌ 行被判异常,故仅真失败打 ❌)。
#
# 为什么用 .backup 而非 cp 三件套:
#   .backup 是 SQLite 在线一致性快照接口,拷贝期间即使 app 在写也产出自洽单文件副本,
#   不存在 cp 三件套"拷到一半正好有写事务"的中间态风险。docker 下后台随时可能有人配置台写,
#   无低峰保证,故定时备份必须走 .backup。产物单文件自洽(无 -wal/-shm),restore 已兼容。
#   迁移前备份也改用本脚本(在线 .backup 单文件自洽),或停 app 后 cp 三件套;旧 deploy 的 node lib/sqlite-backup.cjs 随管线删除,不再自动跑。
#
# 用法:
#   ./backup.sh                                    # 用 config.sh 默认值
#   ./backup.sh --db <path> --env prod --keep 7 --data-dir <dir>
#   cron: 0 3 * * * /.../ops/sqlite/backup.sh --db ... --env prod --keep 7 --data-dir ... >/dev/null 2>&1
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)       DB="$2"; shift 2 ;;
    --env)      ENV="$2"; shift 2 ;;
    --keep)     KEEP="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
sqlite_derive
BASENAME="$(basename "$DB")"

# ── 前置检查 ──
if ! sqlite_has_cli; then
  sqlite_log "❌ 宿主无 sqlite3,备份无法执行(DB=$DB)。请装 sqlite3 或改方案。"
  exit 1
fi
if [[ ! -f "$DB" ]]; then
  sqlite_log "⚠️  主库不存在($DB),首次部署跳过。"
  exit 0
fi

DEST_DIR="${BACKUP_DIR}/${TAG}.$(_ts)"
DEST_FILE="${DEST_DIR}/${BASENAME}"
mkdir -p "$DEST_DIR"

# ── 在线一致性备份 ──
sqlite_log "▶ 备份开始:sqlite3 \"$DB\" .backup → $DEST_FILE"
if sqlite3 "$DB" ".backup '$DEST_FILE'" 2>>"$LOG_FILE"; then
  if sqlite_is_valid "$DEST_FILE"; then
    SIZE=$(stat -c '%s' "$DEST_FILE" 2>/dev/null || stat -f '%z' "$DEST_FILE")
    sqlite_log "✅ 备份完成:$DEST_FILE (${SIZE}B,单文件自洽,WAL 已并入)"
  else
    sqlite_log "❌ 备份产物非有效 SQLite(魔数不符),已清理:$DEST_FILE"
    rm -f "$DEST_FILE"; rmdir "$DEST_DIR" 2>/dev/null || true
    exit 1
  fi
else
  sqlite_log "❌ sqlite3 .backup 失败(见日志上行 stderr),已清理半成品:$DEST_FILE"
  rm -f "$DEST_FILE"; rmdir "$DEST_DIR" 2>/dev/null || true
  exit 1
fi

# ── 轮转 ──
sqlite_rotate "$BACKUP_DIR" "$TAG" "$KEEP"
exit 0
