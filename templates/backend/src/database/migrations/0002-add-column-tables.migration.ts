import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 栏目模块迁移:建 column_item + column_image 两张表(一对多,CASCADE)
 *
 * prod 环境 synchronize=false,靠此迁移建表。
 * 表结构与 entities/column-*.entity.ts 逐字段对齐。
 */
export class AddColumn1740000000001 implements MigrationInterface {
  name = 'AddColumn1740000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 栏目(区块)表
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "column_item" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "category" varchar NOT NULL,
        "title" varchar NOT NULL,
        "time" varchar NOT NULL DEFAULT '',
        "status" varchar NOT NULL DEFAULT 'designing',
        "route" varchar,
        "sort" integer NOT NULL DEFAULT 0,
        "enabled" boolean NOT NULL DEFAULT 1,
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_column_item_category" ON "column_item" ("category")`
    );

    // 设计稿图片表(FK → column_item.id,ON DELETE CASCADE)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "column_image" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "itemId" integer NOT NULL,
        "imageUrl" varchar NOT NULL DEFAULT '',
        "description" varchar NOT NULL DEFAULT '',
        "time" varchar NOT NULL DEFAULT '',
        "sort" integer NOT NULL DEFAULT 0,
        "createTime" datetime NOT NULL DEFAULT (datetime('now')),
        "updateTime" datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("itemId") REFERENCES "column_item" ("id") ON DELETE CASCADE
      )`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_column_image_itemId" ON "column_image" ("itemId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_column_image_itemId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "column_image"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_column_item_category"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "column_item"`);
  }
}
