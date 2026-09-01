import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 审计日志表迁移：新增 audit_log
 * 幂等:CREATE TABLE IF NOT EXISTS
 */
export class AddAuditLog1740000000003 implements MigrationInterface {
  name = 'AddAuditLog1740000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }
}
