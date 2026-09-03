import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DataSource } from 'typeorm';

/**
 * 独立 DataSource：供 TypeORM CLI（migration:generate）使用。
 *
 * ★ 这是「脚本资产」,不在 src 运行时依赖图里——app 运行时走
 *   src/database/sqlite.config.ts（forRootAsync,迁移显式 import 进 bundle,
 *   prod 启动自动跑 migrationsRun）。本文件仅 CLI 用,不进 webpack bundle
 *   （entry=src/main.ts,scripts 不被 import）,也不进 buildops/pack 产物。
 *
 * 用法（在 backend/ 下）：
 *   pnpm migration:generate src/database/migrations/xxx   # 改实体后生成新迁移
 *
 * 按 NODE_ENV 读对应 yaml（与 src/config/configuration.ts 同口径）。
 * CommonJS（与 backend tsconfig module=commonjs 一致）,用 __dirname。
 * 路径相对 scripts/ 目录校准：config→../config,entities/migrations→../src/...。
 */
const env = process.env.NODE_ENV || 'develop';
const configFile = `config.${env}.yaml`;
const configPath = path.join(__dirname, '..', 'config', configFile);
const fallbackPath = path.join(__dirname, '..', 'config', 'config.develop.yaml');
const yamlPath = fs.existsSync(configPath) ? configPath : fallbackPath;
const cfg = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as any;

// DB_DIR env 覆盖 database.dir（与 configuration.ts 一致）：仅目录可外配。
// 文件名由程序按 NODE_ENV 定死为 g-backend.<env>.sqlite(prod=g-backend.prod.sqlite /
// dev=g-backend.dev.sqlite),不外配;未设 DB_DIR 则用 yaml 的 dir(相对 data/ → WORKDIR /app)。
const isProd = env === 'prod';
const dbFilename = isProd ? 'g-backend.prod.sqlite' : 'g-backend.dev.sqlite';
const dbPath = path.join(process.env.DB_DIR || cfg.database.dir, dbFilename);

const entitiesGlob = path.join(__dirname, '..', 'src', 'entities', '*.{ts,js}');
const migrationsGlob = path.join(__dirname, '..', 'src', 'database', 'migrations', '*.{ts,js}');

/**
 * 应用 PRAGMA：与 app 运行时 sqlite.config.ts 保持一致。
 * journal_mode=WAL 是数据库级持久设置（一经设置,后续所有连接自动继承 WAL）,
 * 但 synchronous/busy_timeout/foreign_keys 是逐连接的,迁移 CLI 连接也需显式设置,
 * 以便在与运行中 app 进程共享同一 sqlite 文件时不立即 SQLITE_BUSY。
 */
function applyPragmas(db: any) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA wal_autocheckpoint = 1000');
}

export default new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: false, // 迁移机制下永远 false,避免运行期改表
  logging: cfg.database.logging,
  entities: [entitiesGlob],
  migrations: [migrationsGlob],
  migrationsTableName: 'typeorm_migrations',
  // 与 app 运行时对齐：WAL + per-connection PRAGMA（防迁移期 SQLITE_BUSY、保证一致性）
  enableWAL: true,
  timeout: 5000,
  prepareDatabase: applyPragmas
});
