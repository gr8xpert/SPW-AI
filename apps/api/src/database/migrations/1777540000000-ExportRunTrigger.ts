import { MigrationInterface, QueryRunner } from 'typeorm';

// 2026-11-04: Feed Export run buttons. An export log row now says whether a
// reader fetched the URL or someone pressed the button, and Rightmove's push
// log gets one summary row per run (who started it and the counts).
export class ExportRunTrigger1777540000000 implements MigrationInterface {
  name = 'ExportRunTrigger1777540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_logs', 'trigger'))) {
      await queryRunner.query("ALTER TABLE feed_export_logs ADD COLUMN `trigger` VARCHAR(10) NOT NULL DEFAULT 'read'");
    }
    if (!(await queryRunner.hasColumn('rightmove_push_logs', 'trigger'))) {
      await queryRunner.query('ALTER TABLE rightmove_push_logs ADD COLUMN `trigger` VARCHAR(10) NULL');
    }
    if (!(await queryRunner.hasColumn('rightmove_push_logs', 'summary'))) {
      await queryRunner.query('ALTER TABLE rightmove_push_logs ADD COLUMN summary JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('rightmove_push_logs', 'summary')) {
      await queryRunner.query('ALTER TABLE rightmove_push_logs DROP COLUMN summary');
    }
    if (await queryRunner.hasColumn('rightmove_push_logs', 'trigger')) {
      await queryRunner.query('ALTER TABLE rightmove_push_logs DROP COLUMN `trigger`');
    }
    if (await queryRunner.hasColumn('feed_export_logs', 'trigger')) {
      await queryRunner.query('ALTER TABLE feed_export_logs DROP COLUMN `trigger`');
    }
  }
}
