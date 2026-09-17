import { MigrationInterface, QueryRunner } from 'typeorm';

// feed_configs.removeMissing: after a complete sync, properties this feed
// imported that are no longer in the feed (sold, withdrawn) are deleted, so the
// site mirrors the source. On by default; a client that wants to keep them
// switches it off per feed (or turns off "Enable Feed Sync" on one property).
// feed_import_logs.removedCount records how many a run removed.
export class FeedRemoveMissing1777030000000 implements MigrationInterface {
  name = 'FeedRemoveMissing1777030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_configs', 'removeMissing'))) {
      await queryRunner.query(
        `ALTER TABLE feed_configs ADD COLUMN removeMissing TINYINT(1) NOT NULL DEFAULT 1`,
      );
    }
    if (!(await queryRunner.hasColumn('feed_import_logs', 'removedCount'))) {
      await queryRunner.query(
        `ALTER TABLE feed_import_logs ADD COLUMN removedCount INT NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE feed_import_logs DROP COLUMN removedCount`);
    await queryRunner.query(`ALTER TABLE feed_configs DROP COLUMN removeMissing`);
  }
}
