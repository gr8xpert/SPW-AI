import { MigrationInterface, QueryRunner } from 'typeorm';

// 2026-11-03: a website key's XML feed is now logged per run like the main
// feeds (feed_export_logs.apiKeyId), and the WordPress plugin reports where its
// property pages live (site_checkins.detailPageUrl) for "View on website".
export class ExportLogKeyAndDetailPage1777520000000 implements MigrationInterface {
  name = 'ExportLogKeyAndDetailPage1777520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_logs', 'apiKeyId'))) {
      await queryRunner.query('ALTER TABLE feed_export_logs ADD COLUMN apiKeyId INT NULL');
    }
    if (!(await queryRunner.hasColumn('site_checkins', 'detailPageUrl'))) {
      await queryRunner.query('ALTER TABLE site_checkins ADD COLUMN detailPageUrl VARCHAR(500) NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('site_checkins', 'detailPageUrl')) {
      await queryRunner.query('ALTER TABLE site_checkins DROP COLUMN detailPageUrl');
    }
    if (await queryRunner.hasColumn('feed_export_logs', 'apiKeyId')) {
      await queryRunner.query('ALTER TABLE feed_export_logs DROP COLUMN apiKeyId');
    }
  }
}
