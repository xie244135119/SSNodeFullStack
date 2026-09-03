#!/usr/bin/env bash
# SQLite 损坏快速切换(restore)—— 留现场 + 优先 .recover 抢救 + 回退备份,RTO 秒级。
# 不重启进程(进程重启由 supervisor 负责),结束时打印 pm2/systemd/docker 重启命令。
#
# 流程:
#   1) 移走损坏主库(连 -wal/-shm 一起)为 <db>.corrupt.<ts>,留现场不删。
#   2) 若有 sqlite3 CLI 且未 --no-recover:.recover 抢救残页 → .sql → 导入新库 → 魔数校验。
#   3) .recover 失败/跳过/产物无效 → 回退到最近一份备份目录(或 --backup <dir> 指定):
#      主库 + -wal/-shm(存在才拷)一起 cp 回原位。
#   4) .recover 成功路径兜底清 -wal/-shm(重建库本无旁文件);备份还原路径旁文件已就位不动。
#   5) 不重启进程,打印重启命令。
#
# 用法:
#   ./restore.sh --db <损坏主库> [--env prod] [--backup <备份目录>] [--no-recover] [--data-dir <dir>]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

NO_RECOVER=0
BACKUP_ROOT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)         DB="$2"; shift 2 ;;
    --env)        ENV="$2"; shift 2 ;;
    --backup)     BACKUP_ROOT="$2"; shift 2 ;;
    --no-recover) NO_RECOVER=1; shift ;;
    --data-dir)   DATA_DIR="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
sqlite_derive
BASENAME="$(basename "$DB")"
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

[[ -f "$DB" ]] || { echo "✗ 主库不存在: $DB" >&2; exit 1; }
TS=$(_ts)
CORRUPT="${DB}.corrupt.${TS}"

# 1) 留现场:损坏主库 + 旁文件一起移走
echo "▶ 移走损坏主库 → $CORRUPT"
mv "$DB" "$CORRUPT"
mv "${DB}-wal" "${CORRUPT}-wal" 2>/dev/null || true
mv "${DB}-shm" "${CORRUPT}-shm" 2>/dev/null || true

# 2) 优先 .recover 抢救(需 sqlite3 CLI)。注意:.recover 产物是 SQL 文本,
#    不能 `sqlite3 corrupt ".recover" > db`(非有效库),须先落 .sql 再导入空库重建。
RESTORED=0
if sqlite_has_cli && [[ "$NO_RECOVER" -eq 0 ]]; then
  SQL="${DB}.recovered.${TS}.sql"
  echo "▶ .recover 抢救残页 → $SQL"
  if sqlite3 "$CORRUPT" ".recover" > "$SQL" 2>>"$LOG_FILE"; then
    echo "▶ 导入 $SQL → $DB"
    if sqlite3 "$DB" < "$SQL" 2>>"$LOG_FILE" && sqlite_is_valid "$DB"; then
      echo "✓ .recover 抢救成功 → $DB"
      rm -f "$SQL"
      RESTORED=1
    else
      echo "⚠ .recover 产物导入/校验失败,回退备份" >&2
      rm -f "$SQL" "$DB"
    fi
  else
    echo "⚠ .recover 失败,清理半成品后回退备份" >&2
    rm -f "$SQL" "$DB"
  fi
elif ! sqlite_has_cli; then
  echo "⚠ 无 sqlite3 CLI,跳过 .recover,直接回退备份" >&2
fi

# 3) 回退到最近三件套备份目录
if [[ "$RESTORED" -eq 0 ]]; then
  if [[ -z "$BACKUP_ROOT" ]]; then
    BACKUP_ROOT=$(ls -1d "${BACKUP_DIR}"/${TAG}.* 2>/dev/null | sort -r | head -1)
  fi
  BACKUP_MAIN="${BACKUP_ROOT}/${BASENAME}"
  if [[ -z "$BACKUP_ROOT" || ! -f "$BACKUP_MAIN" ]]; then
    echo "✗ 无可用备份(${BACKUP_DIR}/${TAG}.* 目录)。损坏主库留于 $CORRUPT,需手动处理。" >&2
    sqlite_log "❌ restore 失败:无可用备份,损坏主库留于 $CORRUPT"
    exit 1
  fi
  echo "▶ 回退备份 $BACKUP_MAIN → $DB"
  rm -f "$DB" && cp -a "$BACKUP_MAIN" "$DB"
  for ext in -wal -shm; do
    src="${BACKUP_ROOT}/${BASENAME}${ext}"
    # if/then 而非 [[ -f ]] && { ... },旁文件不存在时整句返回 1 会触发 set -e 退出
    if [[ -f "$src" ]]; then
      rm -f "${DB}${ext}" && cp -a "$src" "${DB}${ext}"
    fi
  done
  echo "✓ 已从备份还原: $DB"
fi

# 4) .recover 成功路径清残留 -wal/-shm;备份还原路径旁文件已就位不动
if [[ "$RESTORED" -eq 1 ]]; then
  rm -f "${DB}-wal" "${DB}-shm"
  echo "✓ 清理 .recover 残留 -wal/-shm"
fi

sqlite_log "✅ restore 完成:$DB(recover=${RESTORED},现场=$CORRUPT)"
echo
echo "✓ 主库已就绪: $DB"
echo "  损坏现场保留: $CORRUPT(事后可再 .recover 或取证后删除)"
echo "  请重启进程使新库生效:"
echo "    pm2:     pm2 restart g-fullstack-backend"
echo "    systemd: systemctl restart g-fullstack-backend"
echo "    docker:  docker restart g-fullstack-backend"
