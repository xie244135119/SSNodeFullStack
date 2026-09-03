# SQLite 运维工具(现场 shell 版)

不依赖 node、不进容器,运维现场可直接跑。脚本随 `backend/ops/sqlite/` 整目录发布到
宿主 `${backendServiceDir}/ops/sqlite/`(与 backend 发布版本解耦,跨版本共享)。
首次部署由运维手动把整目录拷到宿主并装 crontab(详见下文「与发布脚本的关系」)。

## 配置

改 `config.sh` 一处即可(`DATA_DIR`/`ENV`/`DB_NAME`/`KEEP`),所有脚本都 source 它。也可由参数覆盖:

| 参数 | 说明 |
|---|---|
| `--db <path>` | 主库路径(默认 `${DATA_DIR}/${DB_NAME}`) |
| `--env <prod\|develop>` | 环境,未显式设 `DB_NAME` 时按此推导文件名(prod→`g-fullstack.prod.sqlite` / dev→`g-fullstack.dev.sqlite`,与 app 代码定死的一致) |
| `--keep <n>` | 保留份数(默认 7) |
| `--data-dir <dir>` | 数据目录,派生 backup/logs 子目录 |
| `--backup <dir>` | restore 指定回退的备份目录(不指定则取最近一份) |
| `--no-recover` | restore 跳过 `.recover`,直接回退备份 |

### 主库文件名(由 app 定死,此处仅作运维定位)

`DB_NAME` 默认按 `ENV` 推导为 `g-fullstack.prod.sqlite`(prod)/ `g-fullstack.dev.sqlite`(dev),
与 app 代码(`sqlite.config.ts` / `data-source.ts`)定死的文件名一致——文件名不外配,
仅目录(`DB_DIR`/`backendDataDir`)可配。备份目录名随之用 `<tag>.<ts>`
(`<tag>` = `DB_NAME` 去扩展名:`g-fullstack.prod.sqlite → g-fullstack.prod`)。

改 `config.sh` 的 `DB_NAME` 可显式覆盖(如排障指向特定文件),但默认值勿改——
须与 app 代码定死的文件名一致,否则脚本找不到主库。

## 三件套

```bash
# 定时在线备份(cron 与手动均用):sqlite3 .backup 产单文件自洽快照(WAL 已并入)
./backup.sh --db /data/server/g-fullstack/data/g-fullstack.prod.sqlite --env prod --keep 7

# 损坏快速切换:留现场 → 优先 .recover 抢救 → 回退备份;不重启进程,打印重启命令
./restore.sh --db /data/server/g-fullstack/data/g-fullstack.prod.sqlite --env prod

# 健康探针:文件头魔数判定,不依赖 sqlite3 CLI;exit 0 健康 / 1 异常
./healthcheck.sh --db /data/server/g-fullstack/data/g-fullstack.prod.sqlite
```

异常自动切换:`./healthcheck.sh --db <db> --env prod || ./restore.sh --db <db> --env prod`

## 产物与日志(与 ops 页探针同源,勿改)

- 备份目录:`${DATA_DIR}/backup/<tag>.<ts>/<basename>`(单文件自洽主库)
- 日志文件:`${DATA_DIR}/logs/sqlite-backup.log`(ops 页 `SqliteBackupLogProbe` 读尾 50 行;`❌` 行被判异常,故脚本仅真失败打 `❌`)

## 与发布脚本的关系

- **定时备份(cron)**:本目录 `backup.sh`(在线 `.backup`),由宿主 crontab 调用。
  首次部署运维手动装:`crontab -e` 加一行(如 `0 3 * * * /data/server/g-fullstack/ops/sqlite/backup.sh --env prod --keep 7 >/dev/null 2>&1`)。
- **迁移前备份**:原 `scripts/lib/sqlite-backup.cjs`(node cp 三件套)随旧管线删除,不再自动跑。
  需时手动触发:`./backup.sh --env prod`(在线 `.backup`,WAL 已并入,产物单文件自洽)。
  restore 兼容历史 cp 三件套产物与 `.backup` 单文件产物(旁文件存在才拷)。
- 根 `scripts/sqlite-ops.cjs` 早已废弃删除,运维现场统一用本目录 shell 版。
