import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始迁移:建框架全部表(模板唯一迁移文件)
 *
 * prod 环境 synchronize=false,靠此迁移建表。
 * develop 环境 synchronize=true(开发期改实体直接同步),此迁移也会跑(幂等)。
 *
 * 表结构与 entities/*.ts 逐字段对齐。SQLite 列类型映射:
 *   string → TEXT,number → INTEGER,boolean → INTEGER(0/1),Date → TEXT/DATETIME
 *
 * 五张框架表:user / screen_config / page_data / audit_log / image。
 * 业务扩展:新增实体后 `pnpm --filter backend migration:generate src/database/migrations/xxxx`
 * 生成新迁移文件,并在 sqlite.config.ts 的 migrations 数组显式 import 注册(必须,勿漏)。
 */
export class Init1740000000000 implements MigrationInterface {
  name = 'Init1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 用户表
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "username" varchar NOT NULL UNIQUE,
        "password" varchar NOT NULL,
        "nickname" varchar NOT NULL DEFAULT '',
        "role" varchar NOT NULL DEFAULT 'web',
        "status" varchar NOT NULL DEFAULT '1',
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );

    // 大屏清单表
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "screen_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "key" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "path" varchar NOT NULL,
        "component" varchar NOT NULL,
        "width" integer NOT NULL,
        "height" integer NOT NULL,
        "enabled" boolean NOT NULL DEFAULT 1,
        "sort" integer NOT NULL DEFAULT 0,
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );

    // 大屏页面配置数据表
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "page_data" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "screenKey" varchar NOT NULL,
        "section" varchar NOT NULL DEFAULT '',
        "content" text NOT NULL DEFAULT '{}',
        "updatedBy" varchar NOT NULL DEFAULT '',
        "enabled" boolean NOT NULL DEFAULT 1,
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_page_data_screenKey" ON "page_data" ("screenKey")`);

    // 审计日志表
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "actorName" varchar NOT NULL,
        "action" varchar NOT NULL,
        "detail" varchar NOT NULL DEFAULT '',
        "ip" varchar NOT NULL DEFAULT '',
        "createTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );

    // 图片表(图片管理 CRUD,文件本体在 nginx 静态目录,此处只存记录)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "image" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "name" varchar NOT NULL,
        "url" varchar NOT NULL,
        "size" integer NOT NULL DEFAULT 0,
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_image_name" ON "image" ("name")`);

    // TypeORM 迁移元数据表(typeorm_migrations)
    // 由 migrationsRun 自动管理,无需手建
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_image_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "image"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_page_data_screenKey"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "page_data"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "screen_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
  }
}
