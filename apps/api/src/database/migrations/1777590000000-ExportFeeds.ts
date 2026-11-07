import { MigrationInterface, QueryRunner } from 'typeorm';

// Extra export feeds: any number per client, each with its own format
// (Kyero v3, Fotocasa, ThinkSpain, A Place in the Sun), listings and URL.
// feed_export_logs.exportFeedId: which extra feed a log row belongs to.
export class ExportFeeds1777590000000 implements MigrationInterface {
  name = 'ExportFeeds1777590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('export_feeds'))) {
      await queryRunner.query(`
        CREATE TABLE export_feeds (
          id INT NOT NULL AUTO_INCREMENT,
          tenantId INT NOT NULL,
          title VARCHAR(120) NOT NULL,
          format VARCHAR(20) NOT NULL,
          isEnabled TINYINT(1) NOT NULL DEFAULT 1,
          feedKey VARCHAR(64) NOT NULL,
          includeUnpublished TINYINT(1) NOT NULL DEFAULT 0,
          listingScope VARCHAR(8) NOT NULL DEFAULT 'all',
          propertyIds JSON NULL,
          languages JSON NULL,
          propertyUrlPattern VARCHAR(500) NOT NULL DEFAULT '',
          lastGeneratedAt TIMESTAMP NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX IDX_export_feeds_key (feedKey),
          INDEX IDX_export_feeds_tenant (tenantId),
          CONSTRAINT FK_export_feeds_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
    if (!(await queryRunner.hasColumn('feed_export_logs', 'exportFeedId'))) {
      await queryRunner.query(`ALTER TABLE feed_export_logs ADD COLUMN exportFeedId INT NULL`);
      await queryRunner.query(`ALTER TABLE feed_export_logs ADD INDEX IDX_feed_export_logs_feed (exportFeedId, accessedAt)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE feed_export_logs DROP INDEX IDX_feed_export_logs_feed`);
    await queryRunner.query(`ALTER TABLE feed_export_logs DROP COLUMN exportFeedId`);
    await queryRunner.query(`DROP TABLE export_feeds`);
  }
}
