import { MigrationInterface, QueryRunner } from 'typeorm';

// feed_export_configs.listingScope: which listings the Kyero XML / JSON feeds
// send — 'all' (every live listing, network ones included) or 'own' (the
// client's own: Resales OwnProperty or added by hand). Existing rows keep 'all'.
export class FeedExportScope1777200000000 implements MigrationInterface {
  name = 'FeedExportScope1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_configs', 'listingScope'))) {
      await queryRunner.query(
        "ALTER TABLE feed_export_configs ADD COLUMN listingScope VARCHAR(8) NOT NULL DEFAULT 'all' AFTER includeSold",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE feed_export_configs DROP COLUMN listingScope');
  }
}
