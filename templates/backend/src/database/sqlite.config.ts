import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.interface';
import * as path from 'path';
import { Init1740000000000 } from './migrations/0001-init.migration';

/**
 * 应用 PRAGMA：在驱动 createDatabaseConnection 后、连接被业务用之前调用。
 * 透传给 TypeORM better-sqlite3 driver 的 prepareDatabase(db) 钩子，
 * db 即 better-sqlite3 的 Database 实例，可同步执行 .pragma/.exec。
 *
 * 目标：
 *   - journal_mode=WAL：读写不互斥，备份用 .backup 一致性有保证；产 -wal/-shm 旁文件。
 *   - synchronous=NORMAL：WAL 下 NORMAL 仍保证提交不丢（崩溃只可能丢最近一次未 checkpoint 的 WAL 尾段），
 *     换取写吞吐相对 FULL 的数量级提升。prod 数据价值低（配置项）可接受；如需更强持久性改回 FULL。
 *   - busy_timeout=5000：多进程/多容器共享同一 sqlite 文件时排队 5s 再报 SQLITE_BUSY，
 *     单进程单连接下无害，留作横向扩展余地。
 *   - foreign_keys=ON：实体若有外键约束需打开（默认 OFF），保持引用完整性。
 *   - wal_autocheckpoint=1000（默认）：WAL 达 1000 页自动 checkpoint 回主库，避免 -wal 无限膨胀。
 *
 * 注意 PRAGMA 逐条独立 exec：better-sqlite3 的 .pragma() 只接受单条 PRAGMA，
 * 多条用分号拼接在 .pragma() 下会抛错，故走 .exec 逐条执行。
 */
function applyPragmas(db: any) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA wal_autocheckpoint = 1000');
}

/**
 * 由 env 组装 TypeOrmModuleOptions
 * SQLite(better-sqlite3 驱动)
 *
 * 迁移机制（prod 建表靠它）：
 *   - migrations: 指向 dist/database/migrations/*.js（nest build 后产物）
 *   - migrationsRun: prod=true（启动自动跑迁移），develop=false（靠 synchronize 同步）
 *   - synchronize: prod=false（禁运行期改表），develop=true（开发期改实体即同步）
 * 部署/回滚靠进程启动自动幂等跑迁移(无需显式 migration:run;旧 deploy 管线的显式 run 已随管线删除)。
 *
 * SQLite 持久化加固（防损坏 + 备份一致性 + 多进程余地）：
 *   - enableWAL=true：驱动层开 WAL（配合 prepareDatabase 里的 PRAGMA journal_mode=WAL 双保险）。
 *   - prepareDatabase：在连接创建后跑 PRAGMA（WAL/synchronous=NORMAL/busy_timeout/foreign_keys）。
 *   - timeout=5000：better-sqlite3 层的 SQLITE_BUSY 等待，与 PRAGMA busy_timeout 对齐。
 *   备注：单进程单连接下并发瓶颈在事件循环而非 SQLite；WAL 主要收益是备份一致性与
 *         为将来 pm2 cluster 多实例留余地，写吞吐提升来自 synchronous=NORMAL。
 */
export const buildTypeOrmOptions = (
  config: ConfigService<AppConfig, true>
) => {
  const db = config.get<AppConfig['database']>('database');
  const env = process.env.NODE_ENV || 'develop';
  const isProd = env === 'prod';
  // 文件名按环境定死(不外配):prod=template.prod.sqlite / dev=template.dev.sqlite,
  // 与运维脚本 ops/sqlite/config.sh、ops 探针约定一致。仅目录(dir/DB_DIR)可外配。
  const dbFilename = isProd ? 'template.prod.sqlite' : 'template.dev.sqlite';
  return {
    type: 'better-sqlite3' as const,
    database: path.join(db.dir, dbFilename),
    synchronize: isProd ? false : db.synchronize,
    logging: db.logging as any,
    autoLoadEntities: true,
    entities: [path.join(__dirname, '..', 'entities', '*.{ts,js}')],
    // 迁移显式引用(非文件 glob):单文件 webpack bundle 下无磁盘迁移文件,glob 落空
    // 会让 prod migrationsRun 找不到迁移、不建表;显式 import 让迁移随 bundle 走,tsc 布局同样适用。
    migrations: [Init1740000000000],
    // prod 启动自动跑迁移（幂等）；develop 靠 synchronize，不自动跑迁移
    migrationsRun: isProd,
    // SQLite 持久化加固
    enableWAL: true,
    timeout: 5000,
    prepareDatabase: applyPragmas
  };
};
