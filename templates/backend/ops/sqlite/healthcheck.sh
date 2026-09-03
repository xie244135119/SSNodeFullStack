#!/usr/bin/env bash
# SQLite 健康探针 —— 文件头魔数("SQLite format 3\0")判定,不依赖 sqlite3 CLI。
# 返回 0=健康,1=异常。供 cron/supervisor 主动检测;异常可串 restore 自动切换:
#   ./healthcheck.sh --db <db> --env prod || ./restore.sh --db <db> --env prod
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)        DB="$2"; shift 2 ;;
    --env)       ENV="$2"; shift 2 ;;
    --data-dir)  DATA_DIR="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
sqlite_derive

if sqlite_is_valid "$DB"; then
  echo "✓ 健康: $DB"
  exit 0
else
  echo "✗ 异常: $DB(文件不存在或非 SQLite 格式)" >&2
  exit 1
fi
