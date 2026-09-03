import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 栏目区块:新增 resolution(目标大屏分辨率,非必填,仅展示用)
 *
 * prod 环境 synchronize=false,靠此迁移加列。
 * 幂等:ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS,故先 PRAGMA table_info 探针。
 */
export class AddColumnResolution1740000000002 implements MigrationInterface {
  name = 'AddColumnResolution1740000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = await queryRunner.query(`PRAGMA table_info("column_item")`);
    if (!cols.some((c: { name: string }) => c.name === 'resolution')) {
      await queryRunner.query(
        `ALTER TABLE "column_item" ADD COLUMN "resolution" varchar`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const cols = await queryRunner.query(`PRAGMA table_info("column_item")`);
    if (cols.some((c: { name: string }) => c.name === 'resolution')) {
      await queryRunner.query(
        `ALTER TABLE "column_item" DROP COLUMN "resolution"`
      );
    }
  }
}
