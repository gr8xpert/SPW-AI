import { MigrationInterface, QueryRunner } from 'typeorm';

// The JSON feed gets its own settings (on/off, listings, key) instead of
// sharing the Kyero XML feed's. Existing rows copy the shared values,
// key included, so JSON URLs already handed out keep working.
// feed_export_logs.format gains 'idealista' so idealista downloads no longer
// show up as JSON-feed downloads.
export class JsonFeedSettings1777220000000 implements MigrationInterface {
  name = 'JsonFeedSettings1777220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_configs', 'jsonFeed'))) {
      await queryRunner.query('ALTER TABLE feed_export_configs ADD COLUMN jsonFeed JSON NULL AFTER rightmove');
      await queryRunner.query(
        `UPDATE feed_export_configs SET jsonFeed = JSON_OBJECT(
           'enabled', IF(isEnabled, CAST('true' AS JSON), CAST('false' AS JSON)),
           'includeUnpublished', IF(includeUnpublished, CAST('true' AS JSON), CAST('false' AS JSON)),
           'includeSold', IF(includeSold, CAST('true' AS JSON), CAST('false' AS JSON)),
           'listingScope', listingScope,
           'feedKey', exportKey
         ) WHERE jsonFeed IS NULL`,
      );
    }
    await queryRunner.query(
      "ALTER TABLE feed_export_logs MODIFY COLUMN format ENUM('xml','json','idealista') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE feed_export_logs SET format = 'json' WHERE format = 'idealista'");
    await queryRunner.query("ALTER TABLE feed_export_logs MODIFY COLUMN format ENUM('xml','json') NOT NULL");
    await queryRunner.query('ALTER TABLE feed_export_configs DROP COLUMN jsonFeed');
  }
}
